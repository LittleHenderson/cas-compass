use std::path::PathBuf;
use std::process::Command;

#[test]
fn manifest_runs_full_demo() {
    let binary = env!("CARGO_BIN_EXE_casc");
    let manifest =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../docs/CAS_FULL_DEMO.caspkg.toml");
    let status = Command::new(binary)
        .args(["--manifest", manifest.to_str().unwrap(), "--mode", "check"])
        .status()
        .expect("casc binary runs");
    assert!(status.success());
}

#[test]
fn manifest_directory_runs_full_demo() {
    let binary = env!("CARGO_BIN_EXE_casc");
    let manifest_dir =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../examples/full-demo");
    let status = Command::new(binary)
        .args([
            "--manifest",
            manifest_dir.to_str().unwrap(),
            "--mode",
            "check",
        ])
        .status()
        .expect("casc binary runs on directory manifest");
    assert!(status.success());
}

#[test]
fn logo_flag_prints_cas_banner() {
    let binary = env!("CARGO_BIN_EXE_casc");
    let output = Command::new(binary)
        .arg("--logo")
        .output()
        .expect("casc logo runs");
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("C A S"));
    assert!(stdout.contains("Cognitive"));
}

#[test]
fn adversarial_numeric_and_nested_inputs_return_error_json_without_panic() {
    let binary = env!("CARGO_BIN_EXE_casc");
    let deep_parens = format!("{}CO-2{}", "(".repeat(400), ")".repeat(400));
    let payloads = [
        "CO-256",
        "P256",
        "F999",
        "999999999999999999999999999999",
        "-999999999999999999999999999999",
        "Φ<256:999>",
        "\"",
        deep_parens.as_str(),
    ];

    for mode in ["parse", "run"] {
        for payload in payloads {
            let output = Command::new(binary)
                .args(["--mode", mode, payload])
                .output()
                .expect("casc runs on adversarial input");
            assert!(
                !output.status.success(),
                "casc --mode {mode} should exit nonzero for `{payload}`"
            );
            let stderr = String::from_utf8_lossy(&output.stderr);
            assert!(
                !stderr.contains("panicked at"),
                "casc --mode {mode} panicked on `{payload}`: {stderr}"
            );
            let stdout = String::from_utf8_lossy(&output.stdout);
            let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap_or_else(|e| {
                panic!("expected valid JSON error output for `{payload}` ({mode}): {e}; stdout={stdout}")
            });
            assert_eq!(parsed["valid"], serde_json::json!(false));
            assert!(
                parsed["error"].as_str().map(|s| !s.is_empty()).unwrap_or(false),
                "expected non-empty error field for `{payload}` ({mode}): {parsed}"
            );
        }
    }
}
