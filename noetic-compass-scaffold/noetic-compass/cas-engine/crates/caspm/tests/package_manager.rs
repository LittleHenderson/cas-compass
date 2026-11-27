use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn package_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../examples/full-demo")
}

fn tmp_dir() -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("caspm_{suffix}"));
    fs::create_dir_all(&path).expect("tmp dir");
    path
}

fn copy_dir_recursive(from: &PathBuf, to: &PathBuf) {
    fs::create_dir_all(to).expect("create destination dir");
    for entry in fs::read_dir(from).expect("read source dir") {
        let entry = entry.expect("dir entry");
        let source_path = entry.path();
        let target_path = to.join(entry.file_name());
        let file_type = entry.file_type().expect("file type");
        if file_type.is_dir() {
            copy_dir_recursive(&source_path, &target_path);
        } else {
            fs::copy(&source_path, &target_path).expect("copy file");
        }
    }
}

#[test]
fn package_manager_accepts_directory_manifest() {
    let binary = env!("CARGO_BIN_EXE_caspm");
    let status = Command::new(binary)
        .args(["check", package_dir().to_str().unwrap()])
        .status()
        .expect("caspm check runs");
    assert!(status.success());
}

#[test]
fn package_manager_writes_lockfile() {
    let binary = env!("CARGO_BIN_EXE_caspm");
    let fixture_root = package_dir();
    let temp_root = tmp_dir();
    let root = temp_root.join("full-demo");
    copy_dir_recursive(&fixture_root, &root);
    let lock_path = root.join("caspkg.lock.json");
    if lock_path.exists() {
        fs::remove_file(&lock_path).expect("remove stale lockfile");
    }
    let status = Command::new(binary)
        .args(["lock", root.to_str().unwrap()])
        .status()
        .expect("caspm lock runs");
    assert!(status.success());
    assert!(lock_path.exists());
    let _ = fs::remove_file(lock_path);
}

#[test]
fn package_manager_adds_local_dependency_to_manifest() {
    let binary = env!("CARGO_BIN_EXE_caspm");
    let root = tmp_dir();
    let dep = root.join("dep");
    let app = root.join("app");
    fs::create_dir_all(dep.join("src")).expect("dep src");
    fs::create_dir_all(app.join("src")).expect("app src");
    fs::write(
        dep.join("Cas.toml"),
        "[package]\nname = \"dep\"\nversion = \"0.1.0\"\nentry = \"src/main.cas\"\n\n[dependencies]\n",
    )
    .expect("dep manifest");
    fs::write(dep.join("src").join("main.cas"), "CO-2^C_{F2}\n").expect("dep source");
    fs::write(
        app.join("Cas.toml"),
        "[package]\nname = \"app\"\nversion = \"0.1.0\"\nentry = \"src/main.cas\"\n\n[dependencies]\n",
    )
    .expect("app manifest");
    fs::write(app.join("src").join("main.cas"), "CO-5^E_{F4}\n").expect("app source");

    let status = Command::new(binary)
        .args(["add", app.to_str().unwrap(), "dep", dep.to_str().unwrap()])
        .status()
        .expect("caspm add runs");
    assert!(status.success());

    let manifest = fs::read_to_string(app.join("Cas.toml")).expect("updated manifest");
    assert!(manifest.contains("dep"));
    assert!(manifest.contains("path"));
}

#[test]
fn package_manager_rejects_oversized_numeric_source_without_panic() {
    let binary = env!("CARGO_BIN_EXE_caspm");
    let root = tmp_dir();
    let bad_pkg = root.join("bad_pkg");
    fs::create_dir_all(bad_pkg.join("src")).expect("bad_pkg src");
    fs::write(
        bad_pkg.join("Cas.toml"),
        "[package]\nname = \"bad_pkg\"\nversion = \"0.1.0\"\nentry = \"src/main.cas\"\n\n[dependencies]\n",
    )
    .expect("bad_pkg manifest");
    fs::write(
        bad_pkg.join("src").join("main.cas"),
        "let x = CO-256; let y = Φ<256:999>; x\n",
    )
    .expect("bad_pkg source");

    for subcmd in ["check", "graph"] {
        let output = Command::new(binary)
            .args([subcmd, bad_pkg.to_str().unwrap()])
            .output()
            .expect("caspm runs on malformed package");
        assert!(
            !output.status.success(),
            "caspm {subcmd} must exit nonzero on oversized numeric tokens"
        );
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            !stderr.contains("panicked at"),
            "caspm {subcmd} panicked on malformed package: {stderr}"
        );
        if subcmd == "check" {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let parsed: serde_json::Value = serde_json::from_str(&stdout)
                .expect("caspm check emits valid JSON on syntax error");
            assert_eq!(parsed["valid"], serde_json::json!(false));
            assert!(parsed["error"].as_str().unwrap_or("").contains("0..=9"));
        } else {
            assert!(!stderr.trim().is_empty());
        }
    }
}
