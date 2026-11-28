"""Security regression tests for Finding #2: release evidence integrity (CWE-345, CWE-494).

Verifies that:
- Mutating or substituting even 1 byte of the unsigned subject fails closed
  before loading or invoking the protected signing key.
- Malformed ``expected_subject_sha256`` or ``release_asset_id`` inputs fail
  closed in both the Python API and CLI.
- Signed receipts cryptographically bind ``release_asset_id`` and align across
  the signer, verifier, and candidate assembler.
- ``.github/workflows/customer-production-evidence.yml`` requires both
  ``expected_subject_sha256`` and ``release_asset_id``, splits unprivileged
  immutable-asset verification from the protected signing environment, fetches
  by immutable asset ID (never mutable ``gh release download --pattern``), and
  never uses ``--clobber``.
- The customer-production acceptance runbook forbids ``--clobber`` overwrites
  and documents immutable asset upload with pinned digest and asset ID.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
TESTS = Path(__file__).resolve().parent
for path in (SCRIPTS, TESTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import assemble_customer_production_acceptance_candidate as assembler
import sign_root_ci_protected_deploy_receipt as signer
import test_collect_root_ci_protected_deploy_facts as collector_test
import test_sign_root_ci_protected_deploy_receipt as signer_test
import test_verify_customer_production_acceptance as verifier_test
import verify_customer_production_acceptance as acceptance


WORKFLOW_PATH = ROOT / ".github/workflows/customer-production-evidence.yml"
RUNBOOK_PATH = (
    ROOT
    / "noetic-compass-scaffold/noetic-compass/docs/runbooks/customer_production_acceptance.md"
)


class ReleaseEvidenceIntegritySecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.private_key, cls.pem, cls.authority = signer_test._ephemeral_key()
        cls.payload = signer_test._draft_payload()
        cls.subject_bytes = signer_test._subject_bytes(cls.payload)
        cls.subject_sha256 = hashlib.sha256(cls.subject_bytes).hexdigest()

    def _trusted(self) -> dict:
        return {(signer.ISSUER, signer.KEY_ID): deepcopy(self.authority)}

    def test_single_byte_subject_mutation_fails_before_loading_private_key(self) -> None:
        mutated = bytearray(self.subject_bytes)
        mutated[-1] = ord(" ") if mutated[-1] != ord(" ") else ord("\n")
        mutated_bytes = bytes(mutated)
        self.assertNotEqual(mutated_bytes, self.subject_bytes)

        with patch.object(signer, "_load_private_key") as load_key:
            with self.assertRaisesRegex(ValueError, "expected_subject_sha256"):
                signer.sign_root_ci_protected_deploy_receipt(
                    payload=self.payload,
                    subject_bytes=mutated_bytes,
                    expected_master_head=collector_test.MASTER_SHA,
                    expected_deploy_id=collector_test.DEPLOY_ID,
                    expected_subject_sha256=self.subject_sha256,
                    release_asset_id="123456789",
                    private_key_pem=self.pem,
                    trusted_issuers=self._trusted(),
                    now=collector_test.NOW,
                )
            load_key.assert_not_called()

    def test_substituting_different_valid_subject_fails_before_loading_private_key(
        self,
    ) -> None:
        substituted_payload = deepcopy(self.payload)
        substituted_payload["observation"]["current_active_deploy_id"] = (
            "dep-substituted999"
        )
        substituted_bytes = signer_test._subject_bytes(substituted_payload)
        self.assertNotEqual(
            hashlib.sha256(substituted_bytes).hexdigest(), self.subject_sha256
        )

        with patch.object(signer, "_load_private_key") as load_key:
            with self.assertRaisesRegex(ValueError, "expected_subject_sha256"):
                signer.sign_root_ci_protected_deploy_receipt(
                    payload=substituted_payload,
                    subject_bytes=substituted_bytes,
                    expected_master_head=collector_test.MASTER_SHA,
                    expected_deploy_id=collector_test.DEPLOY_ID,
                    expected_subject_sha256=self.subject_sha256,
                    release_asset_id="123456789",
                    private_key_pem=self.pem,
                    trusted_issuers=self._trusted(),
                    now=collector_test.NOW,
                )
            load_key.assert_not_called()

    def test_malformed_expected_subject_sha256_fails_closed_before_key_load(
        self,
    ) -> None:
        bad_digests = (
            "",
            "A" * 64,
            "a" * 63,
            "a" * 65,
            "g" * 64,
            f" {self.subject_sha256}",
            f"{self.subject_sha256}\n",
            "not-a-sha256",
            None,
            12345,
        )
        for bad_digest in bad_digests:
            with self.subTest(expected_subject_sha256=bad_digest):
                with patch.object(signer, "_load_private_key") as load_key:
                    with self.assertRaises(ValueError):
                        signer.sign_root_ci_protected_deploy_receipt(
                            payload=self.payload,
                            subject_bytes=self.subject_bytes,
                            expected_master_head=collector_test.MASTER_SHA,
                            expected_deploy_id=collector_test.DEPLOY_ID,
                            expected_subject_sha256=bad_digest,  # type: ignore[arg-type]
                            release_asset_id="123456789",
                            private_key_pem=self.pem,
                            trusted_issuers=self._trusted(),
                            now=collector_test.NOW,
                        )
                    load_key.assert_not_called()

    def test_malformed_release_asset_id_fails_closed_before_key_load(self) -> None:
        bad_asset_ids = (
            "",
            "0",
            "0123",
            "-1",
            "123abc",
            "123/../../etc",
            " 123",
            "123\n",
            0,
            -42,
            True,
            False,
            3.14,
        )
        for bad_asset_id in bad_asset_ids:
            with self.subTest(release_asset_id=bad_asset_id):
                with patch.object(signer, "_load_private_key") as load_key:
                    with self.assertRaises(ValueError):
                        signer.sign_root_ci_protected_deploy_receipt(
                            payload=self.payload,
                            subject_bytes=self.subject_bytes,
                            expected_master_head=collector_test.MASTER_SHA,
                            expected_deploy_id=collector_test.DEPLOY_ID,
                            expected_subject_sha256=self.subject_sha256,
                            release_asset_id=bad_asset_id,  # type: ignore[arg-type]
                            private_key_pem=self.pem,
                            trusted_issuers=self._trusted(),
                            now=collector_test.NOW,
                        )
                    load_key.assert_not_called()

    def test_cli_requires_expected_subject_sha256_and_rejects_mismatch_without_output(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subject_path = root / "subject.json"
            subject_path.write_bytes(self.subject_bytes)
            output_path = root / "receipt.json"

            # Missing --expected-subject-sha256 must fail argument parsing.
            with patch("sys.stderr", new_callable=io.StringIO):
                with self.assertRaises(SystemExit) as exit_info:
                    signer.main(
                        [
                            "--payload",
                            str(subject_path),
                            "--subject-file",
                            str(subject_path),
                            "--expected-master-head",
                            collector_test.MASTER_SHA,
                            "--expected-deploy-id",
                            collector_test.DEPLOY_ID,
                            "--output",
                            str(output_path),
                        ]
                    )
            self.assertNotEqual(exit_info.exception.code, 0)
            self.assertFalse(output_path.exists())

            # Mismatched digest fails closed before loading private key or writing output.
            wrong_digest = (
                ("0" if self.subject_sha256[0] != "0" else "1")
                + self.subject_sha256[1:]
            )
            with (
                patch.dict(os.environ, {signer.PRIVATE_KEY_ENV: self.pem}, clear=False),
                patch.object(
                    acceptance,
                    "_load_trusted_issuer_registry",
                    return_value=(self._trusted(), "0" * 64),
                ),
                patch.object(signer, "_load_private_key") as load_key,
                patch("sys.stderr", new_callable=io.StringIO) as stderr,
            ):
                rc = signer.main(
                    [
                        "--payload",
                        str(subject_path),
                        "--subject-file",
                        str(subject_path),
                        "--expected-master-head",
                        collector_test.MASTER_SHA,
                        "--expected-deploy-id",
                        collector_test.DEPLOY_ID,
                        "--expected-subject-sha256",
                        wrong_digest,
                        "--release-asset-id",
                        "5551234",
                        "--output",
                        str(output_path),
                    ]
                )
            self.assertEqual(rc, 1)
            self.assertIn("expected_subject_sha256", stderr.getvalue())
            load_key.assert_not_called()
            self.assertFalse(output_path.exists())

            # Malformed --release-asset-id fails closed before reading key or writing output.
            with (
                patch.dict(os.environ, {signer.PRIVATE_KEY_ENV: self.pem}, clear=False),
                patch.object(signer, "_load_private_key") as load_key,
                patch("sys.stderr", new_callable=io.StringIO) as stderr,
            ):
                rc = signer.main(
                    [
                        "--payload",
                        str(subject_path),
                        "--subject-file",
                        str(subject_path),
                        "--expected-master-head",
                        collector_test.MASTER_SHA,
                        "--expected-deploy-id",
                        collector_test.DEPLOY_ID,
                        "--expected-subject-sha256",
                        self.subject_sha256,
                        "--release-asset-id",
                        "0",
                        "--output",
                        str(output_path),
                    ]
                )
            self.assertEqual(rc, 1)
            self.assertIn("release_asset_id", stderr.getvalue())
            load_key.assert_not_called()
            self.assertFalse(output_path.exists())

    def test_release_asset_id_is_cryptographically_bound_across_verifier_and_assembler(
        self,
    ) -> None:
        receipt = signer.sign_root_ci_protected_deploy_receipt(
            payload=self.payload,
            subject_bytes=self.subject_bytes,
            expected_master_head=collector_test.MASTER_SHA,
            expected_deploy_id=collector_test.DEPLOY_ID,
            expected_subject_sha256=self.subject_sha256,
            release_asset_id="42424242",
            private_key_pem=self.pem,
            trusted_issuers=self._trusted(),
            now=collector_test.NOW,
        )
        self.assertEqual(receipt["release_asset_id"], "42424242")

        # 1. Tampering release_asset_id after signing breaks RS256 verification.
        tampered = deepcopy(receipt)
        tampered["release_asset_id"] = "99999999"
        context = acceptance.ValidationContext(
            repo_root=ROOT,
            evidence_root=ROOT,
            verification_time=collector_test.NOW,
            generated_at=collector_test.NOW,
            expected_master_head=collector_test.MASTER_SHA,
            expected_deploy_id=collector_test.DEPLOY_ID,
            repository_commit=collector_test.MASTER_SHA,
            live=False,
            trusted_issuers=self._trusted(),
            registry_sha256="0" * 64,
        )
        acceptance._validate_receipt(
            tampered,
            gate="root_ci_protected_deploy",
            issuer_name=signer.ISSUER,
            key_id=signer.KEY_ID,
            context=context,
            path="$.receipt",
        )
        self.assertTrue(
            any("RS256 signature verification failed" in err for err in context.errors),
            context.errors,
        )

        # 2. Candidate assembler accepts the signed receipt and preserves release_asset_id.
        with tempfile.TemporaryDirectory() as directory:
            receipt_path = Path(directory) / "root-ci-protected-deploy.json"
            raw = (
                json.dumps(receipt, indent=2, sort_keys=True, ensure_ascii=False)
                + "\n"
            ).encode("utf-8")
            receipt_path.write_bytes(raw)
            with patch.object(
                assembler.acceptance,
                "_load_trusted_issuer_registry",
                return_value=(self._trusted(), "0" * 64),
            ):
                pinned = assembler._load_pinned_root_receipt(
                    receipt_path=receipt_path,
                    expected_receipt_sha256=hashlib.sha256(raw).hexdigest(),
                    expected_master_head=collector_test.MASTER_SHA,
                    expected_deploy_id=collector_test.DEPLOY_ID,
                    verification_time=collector_test.NOW,
                    repo_root=ROOT,
                )
            self.assertEqual(pinned.release_asset_id, "42424242")

        # 3. Assembler preflight rejects invalid release_asset_id values.
        for bad in ("0", "abc", 12345, None):
            with self.subTest(bad_release_asset_id=bad):
                bad_receipt = deepcopy(receipt)
                bad_receipt["release_asset_id"] = bad
                with self.assertRaisesRegex(
                    assembler.AssemblyError, "release_asset_id"
                ):
                    assembler._preflight_receipt_identity(
                        bad_receipt,
                        expected_master_head=collector_test.MASTER_SHA,
                        expected_deploy_id=collector_test.DEPLOY_ID,
                        verification_time=collector_test.NOW,
                    )

        # 4. Verifier rejects release_asset_id on non-root gates as an unknown field.
        bundle = verifier_test.SignedBundle()
        try:
            runtime_payload = verifier_test._gate_payloads()["runtime_worm"]
            ref = bundle.receipt("runtime_worm", runtime_payload)
            runtime_receipt_path = bundle.root / ref["uri"].removeprefix("repo://")
            runtime_receipt = json.loads(
                runtime_receipt_path.read_text(encoding="utf-8")
            )
            runtime_receipt["release_asset_id"] = "42424242"
            runtime_context = acceptance.ValidationContext(
                repo_root=ROOT,
                evidence_root=bundle.root,
                verification_time=verifier_test.NOW,
                generated_at=verifier_test.NOW,
                expected_master_head=verifier_test.MASTER_SHA,
                expected_deploy_id=verifier_test.DEPLOY_ID,
                repository_commit=verifier_test.MASTER_SHA,
                live=False,
                trusted_issuers=bundle.trusted_issuers,
                registry_sha256="0" * 64,
            )
            acceptance._validate_receipt(
                runtime_receipt,
                gate="runtime_worm",
                issuer_name=verifier_test.TEST_ISSUER,
                key_id=verifier_test.TEST_KEY_ID,
                context=runtime_context,
                path="$.receipt",
            )
            self.assertTrue(
                any("unknown fields: release_asset_id" in err for err in runtime_context.errors),
                runtime_context.errors,
            )
        finally:
            bundle.close()

    def test_workflow_enforces_immutable_asset_id_and_sha256_pinning(self) -> None:
        workflow_text = WORKFLOW_PATH.read_text(encoding="utf-8")

        # Required workflow_dispatch inputs visible before protected approval.
        self.assertIn("expected_subject_sha256:", workflow_text)
        self.assertIn("release_asset_id:", workflow_text)
        self.assertIn("^[0-9a-f]{64}$", workflow_text)
        self.assertIn("^[1-9][0-9]*$", workflow_text)

        # Immutable GitHub REST API asset fetch + release membership verification.
        self.assertIn("repos/$GITHUB_REPOSITORY/releases/assets/$RELEASE_ASSET_ID", workflow_text)
        self.assertIn('Accept: application/octet-stream', workflow_text)
        self.assertIn("repos/$GITHUB_REPOSITORY/releases/tags/$tag", workflow_text)

        # Mutable tag+pattern download and --clobber are strictly forbidden.
        self.assertNotIn("gh release download", workflow_text)
        self.assertNotIn("--pattern", workflow_text)
        self.assertNotIn("--clobber", workflow_text)

        # Signer invocation passes both pinned subject digest and immutable asset ID.
        self.assertIn('--expected-subject-sha256 "$EXPECTED_SUBJECT_SHA256"', workflow_text)
        self.assertIn('--release-asset-id "$RELEASE_ASSET_ID"', workflow_text)

        # Verify workflow_dispatch inputs block requires both expected_subject_sha256 and release_asset_id.
        self.assertRegex(
            workflow_text,
            r"expected_subject_sha256:\n(?:[ \t]+[^\n]+\n)*?[ \t]+required:\s*true",
        )
        self.assertRegex(
            workflow_text,
            r"release_asset_id:\n(?:[ \t]+[^\n]+\n)*?[ \t]+required:\s*true",
        )

        # Split verification job (unprivileged) -> protected signing job (customer-production).
        verify_marker = "\n  verify_immutable_subject:\n"
        sign_marker = "\n  root_ci_protected_deploy_receipt:\n"
        self.assertIn(verify_marker, workflow_text)
        self.assertIn(sign_marker, workflow_text)
        verify_idx = workflow_text.index(verify_marker)
        sign_idx = workflow_text.index(sign_marker)
        self.assertLess(verify_idx, sign_idx)

        verify_job_text = workflow_text[verify_idx:sign_idx]
        sign_job_text = workflow_text[sign_idx:]

        # Pre-signing verification job must NOT have protected environment or signing key access.
        self.assertNotIn("environment: customer-production", verify_job_text)
        self.assertNotIn("CUSTOMER_PRODUCTION_SIGNING_KEY_PEM", verify_job_text)

        # Protected signing job must depend on verify_immutable_subject and run in customer-production.
        self.assertIn("needs: verify_immutable_subject", sign_job_text)
        self.assertIn("environment: customer-production", sign_job_text)

        # Only one signing step references CUSTOMER_PRODUCTION_SIGNING_KEY_PEM, after re-verifying SHA-256.
        self.assertEqual(
            sign_job_text.count("secrets.CUSTOMER_PRODUCTION_SIGNING_KEY_PEM"), 1
        )
        key_lines = [
            line
            for line in sign_job_text.splitlines()
            if "CUSTOMER_PRODUCTION_SIGNING_KEY_PEM" in line
        ]
        self.assertEqual(len(key_lines), 1)
        reverify_idx = sign_job_text.index('test "$actual_subject_sha256" = "$EXPECTED_SUBJECT_SHA256"')
        secret_idx = sign_job_text.index("secrets.CUSTOMER_PRODUCTION_SIGNING_KEY_PEM")
        self.assertLess(reverify_idx, secret_idx)

    def test_runbook_forbids_clobber_and_documents_immutable_asset_pinning(
        self,
    ) -> None:
        runbook_text = RUNBOOK_PATH.read_text(encoding="utf-8")
        self.assertNotIn("--clobber", runbook_text)
        self.assertIn("expected_subject_sha256", runbook_text)
        self.assertIn("release_asset_id", runbook_text)
        self.assertIn("root-ci-protected-deploy-<short-sha>-", runbook_text)


if __name__ == "__main__":
    unittest.main()
