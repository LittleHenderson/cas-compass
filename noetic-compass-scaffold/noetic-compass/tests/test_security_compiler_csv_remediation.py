"""Regression tests for Security Findings #3 (Notation Compiler File Access) and #9 (CSV Formula Injection)."""

from __future__ import annotations

import builtins
import csv
import io
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from api.notation.compiler import (
    CompilerError,
    Instruction,
    MAX_IMPORT_COUNT,
    MAX_IMPORT_DEPTH,
    MAX_IMPORT_FILE_BYTES,
    MAX_TOTAL_IMPORT_BYTES,
    RuntimeEnv,
    compile_expression,
    compile_file,
    execute,
)
from api.store import clear_memory_store
from api.utils.csv_safety import (
    CSV_DOWNLOAD_HEADERS,
    FORMULA_TRIGGERS,
    csv_download_headers,
    sanitize_csv_cell,
    sanitize_csv_dict,
    sanitize_csv_row,
)


FORMULA_PAYLOADS = [
    "=CMD|' /C calc'!A0",
    "+1+1",
    "-2+3",
    "@SUM(A1)",
    "\t=1+1",
    "  =HYPERLINK(\"https://evil.example\",\"click\")",
    "\r=1+1",
    "\x00=1+1",
]


# ---------------------------------------------------------------------------
# Finding #3 — Notation compiler filesystem access isolation & bounds
# ---------------------------------------------------------------------------


class TestHttpNotationCompilerBlocksImports:
    @pytest.mark.parametrize(
        "target_path",
        [
            "/dev/zero",
            "/etc/passwd",
            "./local.cas",
            "../secret.cas",
        ],
    )
    def test_http_compile_rejects_use_before_opening_any_file(
        self,
        client,
        auth_headers,
        monkeypatch,
        target_path: str,
    ):
        """HTTP /notation/compile rejects every `use` target before stat/open with no existence leak."""
        fs_calls: list[str] = []

        orig_open = builtins.open
        orig_os_open = os.open

        def guard_open(file, *args, **kwargs):
            if str(file) == target_path or target_path in str(file):
                fs_calls.append(f"open:{file}")
                raise AssertionError(f"Unexpected builtins.open({file!r})")
            return orig_open(file, *args, **kwargs)

        def guard_os_open(path, *args, **kwargs):
            fs_calls.append(f"os.open:{path}")
            raise AssertionError(f"Unexpected os.open({path!r})")

        monkeypatch.setattr(builtins, "open", guard_open)
        monkeypatch.setattr(os, "open", guard_os_open)

        resp = client.post(
            "/notation/compile",
            json={"expression": f'use "{target_path}"'},
            headers=auth_headers,
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert "File imports ('use') are disabled in request-facing compilation." in detail
        assert target_path not in detail
        assert "/etc" not in detail
        assert "/dev" not in detail
        assert fs_calls == []

    def test_http_compile_errors_identical_for_existing_and_nonexistent_paths(
        self, client, auth_headers
    ):
        """Zero file-existence oracle: existing and missing paths produce identical error responses."""
        r_exists = client.post(
            "/notation/compile",
            json={"expression": 'use "/etc/passwd"'},
            headers=auth_headers,
        )
        r_missing = client.post(
            "/notation/compile",
            json={"expression": 'use "/nonexistent/does_not_exist_12345.cas"'},
            headers=auth_headers,
        )
        assert r_exists.status_code == 422
        assert r_missing.status_code == 422
        assert r_exists.json() == r_missing.json()

    def test_http_compile_handles_recursion_error_as_422(self, client, auth_headers):
        """Deeply nested expressions returning RecursionError fail cleanly as HTTP 422."""
        with patch("api.routes.notation.compile_expression", side_effect=RecursionError("max depth")):
            resp = client.post(
                "/notation/compile",
                json={"expression": "CO-2^C_{F2}"},
                headers=auth_headers,
            )
        assert resp.status_code == 422
        assert "recursion" in resp.json()["detail"].lower()


class TestCompilerImportPolicy:
    def test_compile_expression_defaults_to_allow_imports_false(self, tmp_path: Path):
        helper = tmp_path / "helper.cas"
        helper.write_text("let base = CO-2^C_{F2}", encoding="utf-8")

        artifact = compile_expression(f'use "{helper}"')
        assert not artifact.valid
        assert artifact.error is not None
        assert "disabled in request-facing compilation" in artifact.error

    def test_compile_expression_allow_imports_without_module_dir_fails_closed(self):
        artifact = compile_expression('use "helper.cas"', allow_imports=True)
        assert not artifact.valid
        assert artifact.error is not None
        assert "module directory" in artifact.error

    def test_runtime_vm_blocks_import_opcode_when_allow_imports_false(self):
        with pytest.raises(CompilerError, match="disabled in request-facing compilation"):
            execute([Instruction("IMPORT", "/etc/passwd")], env=RuntimeEnv())

    def test_compile_file_allows_valid_in_root_and_subdir_imports(self, tmp_path: Path):
        sub = tmp_path / "lib"
        sub.mkdir()
        helper = sub / "helper.cas"
        helper.write_text(
            "export let base: state[C] = CO-2^C_{F2}; export fn lift(x: state[C]): relation = x -> CO-5^E_{F4}",
            encoding="utf-8",
        )
        main = tmp_path / "main.cas"
        main.write_text('use "lib/helper.cas"; lift(base)', encoding="utf-8")

        artifact = compile_file(str(main))
        assert artifact.valid, artifact.error
        assert artifact.to_dict()["result"]["final_result"]["kind"] == "relation"

    def test_compile_file_rejects_path_traversal(self, tmp_path: Path):
        outside = tmp_path / "secret.cas"
        outside.write_text("let secret = CO-2^C_{F2}", encoding="utf-8")
        project = tmp_path / "project"
        project.mkdir()
        main = project / "main.cas"
        main.write_text('use "../secret.cas"; secret', encoding="utf-8")

        artifact = compile_file(str(main))
        assert not artifact.valid
        assert artifact.error is not None
        assert "traversal" in artifact.error.lower() or "escapes" in artifact.error.lower()

    def test_compile_file_rejects_absolute_import_path(self, tmp_path: Path):
        helper = tmp_path / "helper.cas"
        helper.write_text("let base = CO-2^C_{F2}", encoding="utf-8")
        main = tmp_path / "main.cas"
        main.write_text(f'use "{helper}"; base', encoding="utf-8")

        artifact = compile_file(str(main))
        assert not artifact.valid
        assert artifact.error is not None
        assert "absolute" in artifact.error.lower()

    def test_compile_file_rejects_file_symlink_import(self, tmp_path: Path):
        outside = tmp_path / "outside.cas"
        outside.write_text("let base = CO-2^C_{F2}", encoding="utf-8")
        project = tmp_path / "project"
        project.mkdir()
        link = project / "link.cas"
        os.symlink(outside, link)
        main = project / "main.cas"
        main.write_text('use "link.cas"; base', encoding="utf-8")

        artifact = compile_file(str(main))
        assert not artifact.valid
        assert artifact.error is not None
        assert "symbolic link" in artifact.error.lower()

    def test_compile_file_rejects_directory_symlink_import(self, tmp_path: Path):
        outside_dir = tmp_path / "outside_dir"
        outside_dir.mkdir()
        (outside_dir / "helper.cas").write_text("let base = CO-2^C_{F2}", encoding="utf-8")
        project = tmp_path / "project"
        project.mkdir()
        os.symlink(outside_dir, project / "linked_dir")
        main = project / "main.cas"
        main.write_text('use "linked_dir/helper.cas"; base', encoding="utf-8")

        artifact = compile_file(str(main))
        assert not artifact.valid
        assert artifact.error is not None
        assert "symbolic link" in artifact.error.lower()

    def test_compile_file_rejects_symlink_entry_file(self, tmp_path: Path):
        target = tmp_path / "real.cas"
        target.write_text("CO-2^C_{F2}", encoding="utf-8")
        link = tmp_path / "link.cas"
        os.symlink(target, link)

        artifact = compile_file(str(link))
        assert not artifact.valid
        assert artifact.error is not None
        assert "symbolic link" in artifact.error.lower()

    def test_compile_file_rejects_fifo_without_blocking(self, tmp_path: Path):
        fifo = tmp_path / "pipe.cas"
        os.mkfifo(fifo)
        main = tmp_path / "main.cas"
        main.write_text('use "pipe.cas"', encoding="utf-8")

        artifact = compile_file(str(main))
        assert not artifact.valid
        assert artifact.error is not None
        assert "regular file" in artifact.error.lower()

    def test_compile_file_rejects_dev_zero_device(self):
        if not os.path.exists("/dev/zero"):
            pytest.skip("/dev/zero not available")
        artifact = compile_file("/dev/zero")
        assert not artifact.valid
        assert artifact.error is not None
        assert "regular file" in artifact.error.lower()

    def test_compile_file_rejects_oversized_import(self, tmp_path: Path):
        huge = tmp_path / "huge.cas"
        huge.write_text("# " + ("A" * (MAX_IMPORT_FILE_BYTES + 64)) + "\nlet x = CO-2^C_{F2}", encoding="utf-8")
        main = tmp_path / "main.cas"
        main.write_text('use "huge.cas"; x', encoding="utf-8")

        artifact = compile_file(str(main))
        assert not artifact.valid
        assert artifact.error is not None
        assert "maximum size" in artifact.error.lower()

    def test_compile_file_rejects_deeply_nested_imports(self, tmp_path: Path):
        depth = MAX_IMPORT_DEPTH + 2
        for i in range(depth, -1, -1):
            path = tmp_path / f"m{i}.cas"
            if i == depth:
                path.write_text("let leaf = CO-2^C_{F2}", encoding="utf-8")
            else:
                path.write_text(f'use "m{i + 1}.cas"; leaf', encoding="utf-8")

        artifact = compile_file(str(tmp_path / "m0.cas"))
        assert not artifact.valid
        assert artifact.error is not None
        assert "depth limit" in artifact.error.lower()

    def test_compile_file_rejects_excessive_import_count(self, tmp_path: Path):
        count = MAX_IMPORT_COUNT + 2
        uses = []
        for i in range(count):
            (tmp_path / f"mod{i}.cas").write_text(f"let v{i} = CO-2^C_{{F2}}", encoding="utf-8")
            uses.append(f'use "mod{i}.cas"')
        main = tmp_path / "main.cas"
        main.write_text("; ".join(uses) + "; v0", encoding="utf-8")

        artifact = compile_file(str(main))
        assert not artifact.valid
        assert artifact.error is not None
        assert "count limit" in artifact.error.lower()

    def test_compile_file_rejects_total_import_bytes_budget(self, tmp_path: Path):
        # Each file is under MAX_IMPORT_FILE_BYTES (200 KiB), 6 files > 1 MiB aggregate budget.
        chunk_size = 200 * 1024
        num_files = (MAX_TOTAL_IMPORT_BYTES // chunk_size) + 2
        uses = []
        for i in range(num_files):
            content = "# " + ("B" * chunk_size) + f"\nlet v{i} = CO-2^C_{{F2}}\n"
            (tmp_path / f"big{i}.cas").write_text(content, encoding="utf-8")
            uses.append(f'use "big{i}.cas"')
        main = tmp_path / "main.cas"
        main.write_text("; ".join(uses) + "; v0", encoding="utf-8")

        artifact = compile_file(str(main))
        assert not artifact.valid
        assert artifact.error is not None
        assert "total imported bytes" in artifact.error.lower()


# ---------------------------------------------------------------------------
# Finding #9 — CSV formula neutralization & safe download headers
# ---------------------------------------------------------------------------


class TestCsvSafetyUnit:
    def test_formula_triggers_constant_present(self):
        for ch in ("=", "+", "-", "@", "\t", "\r"):
            assert ch in FORMULA_TRIGGERS
        assert CSV_DOWNLOAD_HEADERS["X-Content-Type-Options"] == "nosniff"

    @pytest.mark.parametrize(
        "payload",
        [
            *FORMULA_PAYLOADS,
            "\n=1+1",
            "\ufeff=1+1",
            "\tplain",
            "\rplain",
        ],
    )
    def test_sanitize_csv_cell_prefixes_dangerous_strings(self, payload: str):
        result = sanitize_csv_cell(payload)
        assert isinstance(result, str)
        assert result == "'" + payload

    @pytest.mark.parametrize(
        "safe_value",
        [
            "",
            "Alice",
            "CO-2",
            "2026-11-27T12:00:00+00:00",
            "Bronze Research Tier",
            None,
            0,
            42,
            -7,
            3.14,
        ],
    )
    def test_sanitize_csv_cell_preserves_safe_and_numeric_values(self, safe_value):
        assert sanitize_csv_cell(safe_value) == safe_value

    def test_sanitize_csv_row_and_dict(self):
        row = sanitize_csv_row([1, "=1+1", "safe", -3])
        assert row == [1, "'=1+1", "safe", -3]

        mapping = sanitize_csv_dict({"a": "+1+1", "b": 5, "c": "  @SUM(A1)"})
        assert mapping == {"a": "'+1+1", "b": 5, "c": "'  @SUM(A1)"}

    def test_csv_download_headers_sanitizes_filename(self):
        headers = csv_download_headers('report"\r\nX-Injected: 1.csv')
        assert headers["X-Content-Type-Options"] == "nosniff"
        assert "\r" not in headers["Content-Disposition"]
        assert "\n" not in headers["Content-Disposition"]
        assert headers["Content-Disposition"].startswith('attachment; filename="')


class TestValidationAndExportCsvNeutralization:
    def test_validation_label_export_neutralizes_all_formula_payloads(self, client, auth_headers):
        stored_labels: list[dict] = []
        machine_items = [
            {
                "index": i,
                "prompt": f"Prompt {i}",
                "operator_scores": [0.5] * 10,
                "domain_averages": [0.25] * 4,
                "llm_response": {"text": "resp", "model": "mock"},
            }
            for i in range(len(FORMULA_PAYLOADS))
        ]

        with (
            patch("api.routes.validation.load_labels", side_effect=lambda: list(stored_labels)),
            patch("api.routes.validation.save_labels", side_effect=lambda items: (stored_labels.clear(), stored_labels.extend(items))),
            patch("api.routes.validation.load_machine_results", return_value=machine_items),
        ):
            for idx, payload in enumerate(FORMULA_PAYLOADS):
                res = client.post(
                    "/validation/label",
                    headers=auth_headers,
                    json={
                        "item_index": idx,
                        "rater": payload,
                        "operator_scores": [5] * 10,
                        "domain_scores": [5] * 4,
                        "notes": payload,
                    },
                )
                assert res.status_code == 200, res.text

            export = client.get("/validation/export?format=csv", headers=auth_headers)
            assert export.status_code == 200
            assert export.headers["x-content-type-options"] == "nosniff"
            assert "attachment" in export.headers["content-disposition"].lower()

            rows = list(csv.DictReader(io.StringIO(export.text)))
            assert len(rows) == len(FORMULA_PAYLOADS)
            for row, payload in zip(rows, FORMULA_PAYLOADS, strict=True):
                assert row["rater"] == "'" + payload
                assert row["notes"] == "'" + payload

    def test_validation_label_notes_length_capped(self, client, auth_headers):
        res = client.post(
            "/validation/label",
            headers=auth_headers,
            json={
                "item_index": 0,
                "rater": "Alice",
                "operator_scores": [5] * 10,
                "domain_scores": [5] * 4,
                "notes": "x" * 4001,
            },
        )
        assert res.status_code == 422

    def test_validation_evidence_export_neutralizes_all_formula_payloads(self, client, auth_headers):
        evidence_store = {
            "scorer_agreement": [],
            "benchmark_suites": [],
            "error_cases": [],
        }

        def fake_append(kind: str, entry: dict):
            evidence_store[kind].append(entry)
            return evidence_store

        with (
            patch("api.routes.validation.load_evidence", side_effect=lambda: evidence_store),
            patch("api.routes.validation.append_evidence_entry", side_effect=fake_append),
        ):
            for payload in FORMULA_PAYLOADS:
                res = client.post(
                    "/validation/evidence/error-case",
                    headers=auth_headers,
                    json={
                        "kind": "false_positive",
                        "provider": payload,
                        "model": payload,
                        "prompt_excerpt": payload,
                        "expected_tier": payload,
                        "observed_tier": payload,
                        "notes": payload,
                    },
                )
                assert res.status_code == 200, res.text

            # Also verify scorer_agreement where summary starts with generator_provider
            res_sa = client.post(
                "/validation/evidence/scorer-agreement",
                headers=auth_headers,
                json={
                    "generator_provider": "=CMD|' /C calc'!A0",
                    "generator_model": "+1+1",
                    "scorer_provider": "@SUM(A1)",
                    "scorer_model": "-2+3",
                    "prompt_excerpt": "\t=1+1",
                    "machine_score": 7.5,
                    "scorer_score": 7.0,
                    "notes": "\x00=1+1",
                },
            )
            assert res_sa.status_code == 200, res_sa.text

            export = client.get("/validation/evidence/export?format=csv", headers=auth_headers)
            assert export.status_code == 200
            assert export.headers["x-content-type-options"] == "nosniff"
            assert "attachment" in export.headers["content-disposition"].lower()

            rows = list(csv.DictReader(io.StringIO(export.text)))
            assert len(rows) == len(FORMULA_PAYLOADS) + 1

            error_rows = [r for r in rows if r["kind"] == "error_cases"]
            assert len(error_rows) == len(FORMULA_PAYLOADS)
            exported_notes = {r["notes"] for r in error_rows}
            for payload in FORMULA_PAYLOADS:
                assert ("'" + payload) in exported_notes
            for row in error_rows:
                for col in ("provider", "model", "prompt_excerpt", "expected_tier", "observed_tier", "notes"):
                    assert row[col].startswith("'"), f"Unneutralized cell {col}={row[col]!r}"

            sa_rows = [r for r in rows if r["kind"] == "scorer_agreement"]
            assert len(sa_rows) == 1
            assert sa_rows[0]["summary"].startswith("'=CMD")
            assert sa_rows[0]["generator_provider"] == "'=CMD|' /C calc'!A0"
            assert sa_rows[0]["scorer_provider"] == "'@SUM(A1)"
            assert sa_rows[0]["notes"] == "'\x00=1+1"

    def test_assessments_export_csv_neutralizes_all_formula_payloads(self, client):
        import asyncio
        from api.middleware.auth import create_token
        from api.store import save_assessment

        clear_memory_store()
        api_key = "test-key:csv-assessment-export"
        headers = {"Authorization": f"Bearer {create_token(sub='csv-tester', api_key=api_key)}"}

        for payload in FORMULA_PAYLOADS:
            asyncio.run(
                save_assessment(
                    api_key=api_key,
                    text=payload,
                    response={
                        "nccs": {
                            "composite": 82.5,
                            "certification": payload,
                        }
                    },
                )
            )

        # Default JSON export still works unchanged
        json_export = client.get("/assessments/export", headers=headers)
        assert json_export.status_code == 200
        assert json_export.json()["count"] == len(FORMULA_PAYLOADS)

        # CSV export neutralizes every formula payload and sets attachment + nosniff
        export = client.get("/assessments/export?format=csv", headers=headers)
        assert export.status_code == 200
        assert export.headers["x-content-type-options"] == "nosniff"
        assert "attachment" in export.headers["content-disposition"].lower()

        rows = list(csv.DictReader(io.StringIO(export.text)))
        assert len(rows) == len(FORMULA_PAYLOADS)
        exported_texts = {row["text"] for row in rows}
        exported_certs = {row["certification"] for row in rows}
        for payload in FORMULA_PAYLOADS:
            assert ("'" + payload) in exported_texts
            assert ("'" + payload) in exported_certs
