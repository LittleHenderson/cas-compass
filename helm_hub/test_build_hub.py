"""Tests for the HELM Hub builder. Run: python -m unittest helm_hub/test_build_hub.py -v (about 5 s)."""
from contextlib import ExitStack
import hashlib
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

HUB = Path(__file__).resolve().parent
sys.path.insert(0, str(HUB))
import build_hub as b  # noqa: E402


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        t0 = time.perf_counter()
        cls.proc = subprocess.run([sys.executable, str(HUB / "build_hub.py")], capture_output=True, text=True,
                                  encoding="utf-8", errors="replace", timeout=300)
        cls.elapsed = time.perf_counter() - t0
        cls.report = b.check_site()

    def test_build_exits_clean_under_300_s(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stdout[-3000:] + self.proc.stderr[-3000:])
        self.assertLess(self.elapsed, 300)

    def test_all_pages_written(self):
        for name, _ in b.NAV:
            self.assertTrue((b.SITE / name).exists(), name)
        self.assertTrue((b.SITE / "demo.html").exists())

    def test_jargon_lint_passes(self):
        self.assertEqual(self.report["lint"], [])

    def test_links_resolve(self):
        self.assertEqual(self.report["links"], [])

    def test_no_secrets_emails_or_keys(self):
        self.assertEqual(self.report["secrets"], [])

    def test_page_contract(self):
        self.assertEqual(self.report["contract"], [])
        self.assertEqual(self.report["emoji"], [])

    def test_no_prohibited_words_in_hub_text(self):
        self.assertEqual(self.report["prohibited"], [])

    def test_every_lint_term_is_in_the_glossary(self):
        g = (b.SITE / "glossary.html").read_text(encoding="utf-8")
        for k in b.TERMS:
            self.assertRegex(g, b.TERM_RES[k], k)

    def test_glossary_omits_local_approval_record_paths(self):
        g = (b.SITE / "glossary.html").read_text(encoding="utf-8")
        self.assertIsNone(b.APPROVAL_SOURCE_RE.search(g))

    def test_backslash_digits_survive_every_text_path(self):
        path = r"X:\synthetic\fixture\2026-01-01\sample.txt"
        for s in (path, "**" + path + "**", "*" + path + "*", "`" + path + "`", "[" + path + "](u)"):
            self.assertIn(path, b.md(s))
        tbl = b.cardify(b.html_table([["Head"], [path]]))
        self.assertIn(path, tbl)

    def test_ctt_is_in_the_glossary_and_the_lint(self):
        g = (b.SITE / "glossary.html").read_text(encoding="utf-8")
        for t in ("CTT-1", "CTT-2R", "E-MACHINE-S", "Ears / mouth", "9,585,566", "2,482,718"):
            self.assertIn(t, g)
        self.assertIn("CTT", b.TERMS)

    def test_wave_and_pair_wave_defined(self):
        g = (b.SITE / "glossary.html").read_text(encoding="utf-8")
        self.assertIn("Pair wave", g)
        self.assertIn("HELM-R1 wave 6", g)
        self.assertIn("one sealed test round in the HELM-R1 series", g)
        for name in ("build.html", "results.html", "roadmap.html"):
            t = (b.SITE / name).read_text(encoding="utf-8")
            box = t[t.find('<details class="words"'):]
            box = box[:box.find("</details>")]
            self.assertIn('data-term="wave"', box, name)
            self.assertIn('data-term="pair wave"', box, name)
        idx = (b.SITE / "index.html").read_text(encoding="utf-8")
        self.assertIn('<dfn data-term="pair wave"', idx)

    def test_build_page_static_fallback_without_js(self):
        t = (b.SITE / "build.html").read_text(encoding="utf-8")
        # both scenes are in the HTML and not hidden; only scripts hide the inactive one
        self.assertIn('<section class="scene" id="scene-today">', t)
        self.assertIn('<section class="scene" id="scene-intended">', t)
        self.assertIn("html.js .scene[hidden]{display:none}", t)
        self.assertIn('id="scene-toggle" role="group" aria-label="Choose a scene" hidden>', t)
        # the moving dot is invisible without JS, and reduced motion is respected
        self.assertIn(".token{fill:var(--accent);opacity:0}", t)
        self.assertIn("@media (prefers-reduced-motion: reduce)", t)
        self.assertIn("matchMedia('(prefers-reduced-motion: reduce)')", t)
        # every step caption is static text, and the Eye's write arrow is crossed out
        self.assertGreaterEqual(t.count('<li data-parts='), 20)
        self.assertIn('class="xmark"', t)
        self.assertIn("shares nothing with the brain", t)
        self.assertIn("What this animation does not claim.", t)

    def test_new_pages_are_linked(self):
        for name in ("index.html", "results.html"):
            t = (b.SITE / name).read_text(encoding="utf-8")
            self.assertIn('href="build.html"', t)
            self.assertIn('href="files.html"', t)
        self.assertIn('href="files.html#start"', (b.SITE / "index.html").read_text(encoding="utf-8"))
        self.assertIn('href="build.html"', (b.SITE / "architecture.html").read_text(encoding="utf-8"))

    def test_files_page_lists_only_repo_references(self):
        t = (b.SITE / "files.html").read_text(encoding="utf-8")
        self.assertNotIn("data-path=", t)
        self.assertIn('id="start"', t)
        for path, _ in b.PUBLIC_REFERENCES:
            self.assertIn(path, t)

    def test_chat_page_exists_and_is_linked(self):
        self.assertIn(("chat.html", "Talking to HELM"), b.NAV)
        t = (b.SITE / "chat.html").read_text(encoding="utf-8")
        for anchor in ('id="scores"', 'id="exchanges"', 'id="cannot"'):
            self.assertIn(anchor, t)
        self.assertIn("NOT LICENSED", t)
        self.assertIn('href="chat.html"', (b.SITE / "index.html").read_text(encoding="utf-8"))
        self.assertFalse(any("chat.html" in e for e in self.report["lint"]), self.report["lint"])

    def test_chat_page_has_the_four_runs_with_exact_words(self):
        t = (b.SITE / "chat.html").read_text(encoding="utf-8")
        for job in ("c51", "c52", "c53", "c54"):
            self.assertIn(f"<strong>{job}</strong>", t)
        for w in ("FAILURE", "INCONCLUSIVE", "CHAT_WAVE_NO_GAIN", "INSTRUMENT_ERROR", "96 right / 0 wrong", "91 right / 0 wrong",
                  "99 right / 0 wrong", "95 of 97", "91 of 94", "100 of 101", "43 right / 0 wrong", "44 right / 0 wrong", "0.01 USD", "0.02 USD"):
            self.assertIn(w, t, w)
        self.assertEqual(t.count("CHAT_WAVE_NO_GAIN</span>"), 2)

    def test_chat_page_has_at_least_ten_real_transcripts_from_c53_only(self):
        import json
        d = json.loads(b.CHAT_SAMPLES.read_text(encoding="utf-8"))
        n = sum(len(v) for v in d["samples"].values())
        self.assertGreaterEqual(n, 10)
        self.assertEqual(d["job"], "c53")
        t = (b.SITE / "chat.html").read_text(encoding="utf-8")
        self.assertGreaterEqual(t.count('<div class="chat">'), 10)
        self.assertGreaterEqual(t.count("job c53, spent exam"), 10)
        blocks = t.split('<div class="chat">')[1:]
        self.assertTrue(all("job c53, spent exam" in blk.split("</div>")[0] for blk in blocks))
        self.assertFalse(any("c54" in blk.split("</div>")[0] for blk in blocks))
        for tr in (x for v in d["samples"].values() for x in v):
            self.assertIn(tr["id"], t)
            for turn in tr["turns"]:
                self.assertIn(b.esc(turn["helm"]), t)
        self.assertIn('inside: WITNESS_ADMITTED', t)
        self.assertIn('class="msg you noise"', t)

    def test_roadmap_carries_the_intended_talk_section_with_the_owners_words(self):
        r = (b.SITE / "roadmap.html").read_text(encoding="utf-8")
        self.assertIn('id="talk"', r)
        self.assertIn("Intended: talking like a person", r)
        self.assertIn("comment like a normal person would", r)
        self.assertIn("CONVERSE ABOUT", r)
        self.assertIn("TRANSFORMER TRAINED ON THE 40 ELEMENTS", r)
        self.assertGreaterEqual(r.count("INTENDED / NOT A PRESENT CAPABILITY / NOTHING LICENSED"), 13)
        self.assertIn("LLM_WRITTEN_ONLY", r)
        # items 10 to 13 and the owner's second statement of intent (2026-10-21 09:42 PDT)
        self.assertIn("Teaching HELM a new subject by ordinary question-and-answer conversation", r)
        self.assertIn("Memory compacted into CAS, with clues to its subject", r)
        self.assertIn("quot;Refresh my memory&quot; questions, with a fit check and strengthening", r)
        self.assertIn("The Unity Eye applied in these situations, correctly", r)
        self.assertIn("MEMORIES CAN BE COMPACTED INTO CAS W/CLUES TO THERE SUBJECT MATTER", r)
        self.assertIn("USE THE EYE IN THESE SITUATIONS, CORRECTLY APPLIED", r)
        self.assertIn("statement of intent,\nnot an approval", r)
        self.assertIn("Eye acting stays NOT LICENSED", r)
        # the owner's 09:50 PDT statement under item 11
        self.assertIn("WHY NOT EMPLOY THEM IN COMPACTING MEMORIES AS WELL AND CAN WORK WITH CUBES AND RECIPE COEFFICIENTS", r)
        self.assertIn("ONCE WE RUN OUT TOKENS", r)
        # items 14 and 15 and the owner's 2026-10-22 statement of intent
        self.assertGreaterEqual(r.count("INTENDED / NOT A PRESENT CAPABILITY / NOTHING LICENSED"), 16)
        self.assertIn("Thinking deeper on demand: a depth governor in the RPM gate, the Eye as advisor only", r)
        self.assertIn("The HELM Cube: the eventual hardware form", r)
        self.assertIn('id="cube-words"', r)
        self.assertIn("DETERMINE IF MORE RPM DEPTH WAS NEEDED/NECESSARY ON A GIVEN MATTER?", r)
        self.assertIn("QI SUPERCHARGING ONLY", r)
        self.assertIn("GET CLAUDE DESIGN TO DRAW IT UP.", r)
        self.assertIn("docs/working/helm_cube_device_v1/HELM_CUBE_DEVICE_SPEC_V1.md", r)
        self.assertTrue((b.REPO / "docs/working/helm_cube_device_v1/HELM_CUBE_DEVICE_SPEC_V1.md").is_file())
        if (b.ASSETS / "helm_cube_concept.svg").is_file():
            self.assertIn('src="helm_cube_concept.svg"', r)
            self.assertTrue((b.SITE / "helm_cube_concept.svg").is_file())
        else:
            self.assertIn("Slot for the concept drawing", r)

    def test_roadmap_carries_the_statement_of_intent_in_full(self):
        r = (b.SITE / "roadmap.html").read_text(encoding="utf-8")
        self.assertIn('id="intent"', r)
        self.assertIn("the mouth may choose words, never facts", r)
        src = (b.REPO / "docs/working/helm_talk_design_v1/INTENT_MOUTH_TRANSFORMER_20261021.md").read_text(encoding="utf-8")
        for line in src.splitlines():
            if line.strip() and not line.startswith(("#", "---", "`")):
                self.assertIn(b.esc(line.strip())[:40], r, line[:40])
        self.assertIn('roadmap.html#intent', (b.SITE / "index.html").read_text(encoding="utf-8"))
        self.assertIn('roadmap.html#intent', (b.SITE / "files.html").read_text(encoding="utf-8"))

    def test_roadmap_carries_the_picture_teaching_plan_in_full(self):
        r = (b.SITE / "roadmap.html").read_text(encoding="utf-8")
        self.assertIn('id="picture"', r)
        self.assertIn("Intended: teaching HELM a picture it does not know", r)
        self.assertIn("we may not work on this next but draw a plan for it and add it to HELM HUB", r)
        self.assertIn("INTENDED / NOTHING BUILT / NOTHING LICENSED", r)
        src = (b.REPO / "docs/working/helm_eye_sense_teaching_v1/PLAN_TEACH_A_PICTURE_V1.md").read_text(encoding="utf-8")
        for line in src.splitlines():
            s = line.strip().lstrip("-0123456789. ").strip()
            if s and not line.startswith(("#", "---", "`", "|")):
                self.assertIn(b.esc(s)[:30], r, s[:40])
        self.assertIn('roadmap.html#picture', (b.SITE / "index.html").read_text(encoding="utf-8"))

    def test_negatives_are_on_the_scorecard(self):
        r = (b.SITE / "results.html").read_text(encoding="utf-8")
        for w in ("S_UNSAFE_ON_REAL", "EARS_HARMED", "GREW_WRONG_KIND", "WIDE_LEARNING_DID_NOT_EARN_KEEP"):
            self.assertIn(w, r)


class PublicationRedactionTests(unittest.TestCase):
    def test_public_redacts_synthetic_bucket_without_removing_repo_citation(self):
        zeros = "0" * 12
        buckets = (
            f"project-tier-memory-{zeros}-fixture",
            f"example-bucket-{zeros}-west",
            f"team-store-{zeros}-us",
            f"long-prefix-segment-alpha-beta-gamma-storage-{zeros}-tail-segment-extra-chars-end",
            f"trailing-archive-{zeros}-usw2",
        )
        repo_citation = "docs/working/example.md"
        for bucket in buckets:
            tail = "- " if bucket.startswith("trailing-") else ". "
            html = b.scrub_page(f"<p>Private storage: {bucket}{tail}Source: {repo_citation}.</p>")
            self.assertNotIn(bucket, html)
            self.assertIn("[private storage address omitted]", html)
            self.assertIn(repo_citation, html)

    def test_public_load_does_not_touch_private_inputs_even_when_configured(self):
        with tempfile.TemporaryDirectory() as tmp:
            checkout = Path(tmp).resolve()
            canary = checkout / "private-test-input"
            with patch.multiple(b, REPO=checkout, LEDGER=canary, APPROVALS=canary, COVERAGE=canary, RUN_DIRS=[canary]):
                with patch.object(b, "read", return_value="") as read:
                    model = b.load()
            self.assertFalse(any(call.args[0] == canary for call in read.call_args_list))
            self.assertEqual((model["ledger"], model["runs"], model["approvals"], model["coverage"]), ({}, [], [], ""))

    def test_public_build_scrubs_real_renderers_and_demo_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            checkout = (Path(tmp) / "repo").resolve()
            doc = checkout / b.PUBLIC_REFERENCES[0][0]
            doc.parent.mkdir(parents=True)
            doc.write_bytes(b"synthetic public reference")
            assets = checkout / "helm_hub" / "assets"
            assets.mkdir(parents=True)
            drawing = b'<svg xmlns="http://www.w3.org/2000/svg"><title>Fixture</title></svg>'
            (assets / b.CUBE_ASSET_NAME).write_bytes(drawing)
            (assets / "unreviewed-fixture.txt").write_text("synthetic excluded asset", encoding="utf-8")
            demo = checkout / "demo-fixture.html"
            demo.write_text(r'<p data-source="X:\Synthetic\Alpha\demo.txt">i-0123456789abcdef0</p>', encoding="utf-8")
            changelog = r"Ran docs/CAS_HARNESS_SPEC_SHEET.md, Codex\2099-01-02\shortened-canary.md and i-0123456789abcdef0."
            dictionary = (
                "## A–Z entries\n**Fixture** — [Infrastructure]\n- *Source:* "
                + chr(96) + r"X:\Synthetic Space\dictionary-canary.md" + chr(96)
            )
            state = {
                "ledger": {"last_jobs": ["ledger-canary"]},
                "runs": [{"instance": "i-0123456789abcdef0", "title": "run-title-canary"}],
                "secs": {}, "chlog": "## 2026-10-22 HELM fixture\n- " + changelog,
                "dict": dictionary, "entries": b.dict_entries(dictionary),
            }
            renderers = ("home", "thinking", "architecture", "data", "results", "build", "model_card",
                         "safety", "roadmap", "run", "chat", "device")
            site = checkout / "site"
            with ExitStack() as stack:
                stack.enter_context(patch.multiple(
                    b, REPO=checkout, SITE=site, UI_DEMO=demo, ASSETS=assets,
                    CUBE_ASSET_SHA256=hashlib.sha256(drawing).hexdigest(),
                ))
                stack.enter_context(patch.object(b, "load", return_value=state))
                stack.enter_context(patch.object(b, "files_inventory", side_effect=AssertionError("private inventory touched")))
                for name in renderers:
                    stack.enter_context(patch.object(b, "p_" + name, return_value="<p>Other renderer control</p>"))
                b.build()
            html = {p.name: p.read_text(encoding="utf-8") for p in site.glob("*.html")}
            self.assertEqual(len(html), 17)
            self.assertEqual((site / b.CUBE_ASSET_NAME).read_bytes(), drawing)
            self.assertFalse((site / "unreviewed-fixture.txt").exists())
            for canary in ("Alpha", "shortened-canary", "dictionary-canary", "i-0123456789abcdef0", "ledger-canary", "run-title-canary", str(checkout), "data-path="):
                self.assertNotIn(canary, "".join(html.values()))
            self.assertIn(doc.relative_to(checkout).as_posix(), html["files.html"])
            self.assertIn(hashlib.sha256(doc.read_bytes()).hexdigest(), html["files.html"])
            self.assertIn("docs/CAS_HARNESS_SPEC_SHEET.md", html["changelog.html"])
            self.assertIn("Local run records and the private ledger are omitted", html["compute.html"])

    def test_public_read_and_hash_refuse_outside_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp).resolve()
            repo = parent / "repo"
            repo.mkdir()
            outside = parent / "outside-test.md"
            outside.write_text("synthetic-outside-canary", encoding="utf-8")
            with patch.object(b, "REPO", repo):
                self.assertEqual(b.read(outside), "")
                self.assertEqual(b.sha256_file(outside), "unavailable")

    def test_public_asset_rejects_wrong_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp).resolve()
            assets = repo / "helm_hub" / "assets"
            assets.mkdir(parents=True)
            (assets / b.CUBE_ASSET_NAME).write_bytes(b"not the reviewed drawing")
            with patch.multiple(b, REPO=repo, ASSETS=assets):
                with self.assertRaisesRegex(SystemExit, "reviewed fingerprint"):
                    b.read_cube_asset()

    def test_public_scrubs_generic_locator_text_and_preserves_public_citations(self):
        synthetic = (
            "s3://synthetic-private-bucket/prefix",
            "arn:aws:s3:::synthetic-private-bucket",
            "arn:aws:iam::000000000000:role/example",
            "sample-bucket-" + "000000000000" + "-zone",
            r"OneDrive\Desktop\fixture.txt",
            r"Desktop\fixture.txt",
            "Documents/Other/fixture.txt",
            r"Codex\other\fixture.txt",
        )
        public = (
            '<a href="https://example.invalid/references/Desktop/manual.html">Public source</a>',
            "docs/references/OneDrive/example.md",
            "Fictional Author, credited deliberately",
            "Canvas drawing note",
        )
        source = "<p>" + " | ".join(synthetic + public) + "</p>"
        for name in ("demo.html", "results.html"):
            rendered = b.prepare_site_page(name, source)
            for locator in synthetic:
                self.assertNotIn(locator, rendered)
            for citation in public:
                self.assertIn(citation, rendered)
            self.assertEqual(b.private_locator_findings(rendered), set())

    def test_demo_private_locator_checks_include_url_and_script_without_exposing_value(self):
        fixtures = (
            '<a href="s3%3A%2F%2Fsynthetic-private-bucket/holdout">invalid</a>',
            '<a href="&#68;esktop&#92;synthetic-asset">invalid</a>',
            r'<script>const src = "arn\u003aaws:s3:::synthetic-private-bucket";</script>',
            '<span style="background:url(file%3A%2F%2Fsynthetic-host/holdout)">invalid</span>',
        )
        for name in ("demo.html", "results.html"):
            for planted in fixtures:
                with self.subTest(name=name):
                    with self.assertRaisesRegex(SystemExit, r"private locator.*values withheld") as cm:
                        b.prepare_site_page(name, planted)
                    self.assertNotIn("synthetic-", str(cm.exception))
                    with tempfile.TemporaryDirectory() as tmp:
                        p = Path(tmp) / name
                        p.write_text(planted, encoding="utf-8")
                        report = b.check_site(p.parent)
                    self.assertTrue(report["private_locators"])
                    self.assertNotIn("synthetic-", " ".join(report["private_locators"]))

    def test_public_refuses_encoded_locator_in_visible_text_in_both_page_types(self):
        source = "<p>Evidence: %2573%2533%253A%252F%252Fsynthetic-private-bucket</p>"
        for name in ("demo.html", "results.html"):
            with self.assertRaisesRegex(SystemExit, r"unredacted private locator"):
                b.prepare_site_page(name, source)

    def test_provider_bucket_guard_preserves_dates_and_public_references(self):
        names = ("runpod-01234567", "runpod-bucket-01234567",
                 "fixture-runpod-01234567", "fixture-team-RUNPOD-bucket-01234567")
        public = ('<a href="https://example.invalid/docs/runpod-guide.html">Provider guide</a>',
                  "docs/fixture-runpod-design-20261022.md", "notes/report-20261022.md",
                  "archive-01234567", "20261022", "fixture-runpod-012345678",
                  "fixture-runpod-01234567-overview", "fixture-runpodlike-01234567")
        for page in ("demo.html", "results.html"):
            rendered = b.prepare_site_page(page, "<p>" + " | ".join(names + public) + "</p>")
            for name in names:
                self.assertIn("RunPod bucket address", b.locator_kinds(name))
                # Check standalone labels, not the safe strings that merely contain them.
                self.assertNotIn(f">" + name + " |", rendered)
                self.assertNotIn(" | " + name + " |", rendered)
            for item in public:
                self.assertIn(item, rendered)
                self.assertNotIn("RunPod bucket address", b.locator_kinds(item))
            self.assertEqual(rendered.count("[private storage address omitted]"), len(names))
            self.assertEqual(b.private_locator_findings(rendered), set())

    def test_project_memory_slugs_require_the_memory_subdirectory(self):
        locator = "C--Users-fixture-workspace/memory/probe.md"
        unrelated = ("C--Users-fixture-workspace/design/probe.md", "docs/project-memory-planning.md",
                     "docs/memory/public-guide.md", "ordinary-hyphenated-title")
        rendered = b.prepare_site_page("demo.html", "<p>" + " | ".join((locator, *unrelated)) + "</p>")
        self.assertNotIn(locator, rendered)
        self.assertIn("[private project memory locator omitted]", rendered)
        for value in unrelated:
            self.assertIn(value, rendered)

    def test_html_entities_do_not_hide_project_memory_or_provider_bucket(self):
        encoded = ("C&#45;&#45;Users&#45;fixture&#45;workspace&#47;memory&#47;probe.md",
                   "runpod&#45;01234567", "fixture&#45;runpod&#45;01234567")
        for private in encoded:
            with self.subTest(code=encoded.index(private)):
                with self.assertRaisesRegex(SystemExit, "unredacted private locator"):
                    b.prepare_site_page("demo.html", f"<p>{private}</p>")

    def test_url_encoding_does_not_hide_project_memory_or_provider_bucket(self):
        encoded_paths = ("C%2D%2DUsers%2Dfixture%2Dworkspace%2Fmemory%2Fprobe.md",
                         "runpod%2D01234567", "fixture%2Dteam%2Drunpod%2Dbucket%2D01234567")
        public = '<a href="https://example.invalid/docs/archive%2D20261022.html">Public reference</a>'
        for name in ("demo.html", "results.html"):
            self.assertEqual(b.prepare_site_page(name, public), public)
            for private in encoded_paths:
                with self.assertRaisesRegex(SystemExit, "private locator in URL"):
                    b.prepare_site_page(name, f'<a href="https://example.invalid/docs/{private}">Fixture</a>')

    def test_only_reviewed_demo_provenance_fields_are_scrubbed_structurally(self):
        import json
        data = {"sets": [{"brain_dir": r"X:\synthetic path\model", "source": "Desktop/fake.json"}],
                "source": "docs/public/reference.md", "note": "Fictional Author <label>"}
        embed = lambda record: "<script>window.HELM_DEMO = " + json.dumps(record) + ";</script>"
        result = b.prepare_site_page("demo.html", embed(data))
        restored, _ = json.JSONDecoder().raw_decode(result.split("window.HELM_DEMO = ", 1)[1])
        self.assertEqual(restored, {**data, "sets": [{"brain_dir": b.OFF_REPO_SOURCE, "source": b.OFF_REPO_SOURCE}]})
        self.assertNotIn("<label>", result)
        with self.assertRaisesRegex(SystemExit, "private locator"):
            b.prepare_site_page("demo.html", embed({**data, "other": "s3://synthetic-private-bucket/held"}))
        with self.assertRaisesRegex(SystemExit, "private locator"):
            b.prepare_site_page("demo.html", embed(data).replace(";</script>", "; doSomething();</script>"))

    def test_public_chat_uses_no_local_c54_record_or_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            external = Path(tmp) / "synthetic-c54-record.md"
            with patch.multiple(b, C54_RESULT=external, PUBLIC_OUTPUT=True):
                with patch.object(b, "need"), patch.object(b, "chat_samples", return_value={}):
                    with patch.object(b, "read", side_effect=AssertionError("private c54 record touched")):
                        rendered = b.p_chat({"secs": {}})
            self.assertIn("Off-repository run record omitted", rendered)
            self.assertNotIn(str(external), rendered)

    def internal_fixture(self, stack):
        root = Path(stack.enter_context(tempfile.TemporaryDirectory())).resolve()
        # In this synthetic filesystem fixture, explicitly model the host-side
        # ancestors as not being Git checkouts. Markers within the fixture are real.
        ambient_markers = {p / ".git" for p in root.parents}
        real_lstat = Path.lstat
        def fixture_lstat(path, *args, **kwargs):
            if path in ambient_markers:
                raise FileNotFoundError("synthetic fixture boundary")
            return real_lstat(path, *args, **kwargs)
        stack.enter_context(patch.object(Path, "lstat", fixture_lstat))
        return root

    def test_explicit_internal_cli_uses_separate_output(self):
        with ExitStack() as stack:
            parent = self.internal_fixture(stack)
            repo = parent / "repo"
            private = parent / "private"
            repo.mkdir()
            private.mkdir(mode=0o700)
            stack.enter_context(patch.object(b, "REPO", repo))
            stack.enter_context(patch.object(b, "SITE"))
            stack.enter_context(patch.object(b, "PUBLIC_OUTPUT", True))
            stack.enter_context(patch.object(b, "build", side_effect=ValueError("stop before writing")))
            for args, site, public in (([], b.HUB / "site", True), (["--check"], b.HUB / "site", True),
                                       (["--internal", str(private)], private, False)):
                with self.assertRaisesRegex(ValueError, "stop before writing"):
                    b.main(args)
                self.assertEqual(b.SITE, site)
                self.assertEqual(b.PUBLIC_OUTPUT, public)

    def test_internal_bad_cli_targets_stop_before_build(self):
        from contextlib import redirect_stderr
        from io import StringIO
        with ExitStack() as stack:
            root = self.internal_fixture(stack)
            repo = root / "repo"
            inside = repo / "output"
            inside.mkdir(parents=True)
            filled = root / "filled"
            filled.mkdir()
            (filled / "synthetic.txt").write_text("leave untouched", encoding="utf-8")
            other = root / "other" / "output"
            other.mkdir(parents=True)
            (other.parent / ".git").write_text("synthetic worktree pointer", encoding="utf-8")
            checkout = root / "checkout" / "output"
            checkout.mkdir(parents=True)
            git_dir = checkout.parent / ".git"
            git_dir.mkdir()
            (git_dir / "HEAD").write_text("synthetic repository marker", encoding="utf-8")
            ambiguous = root / "ambiguous" / "output"
            ambiguous.mkdir(parents=True)
            (ambiguous.parent / ".git").mkdir()
            bare = root / "bare" / "output"
            bare.mkdir(parents=True)
            (bare.parent / "HEAD").write_text("synthetic bare repository marker", encoding="utf-8")
            (bare.parent / "objects").mkdir()
            (bare.parent / "refs").mkdir()
            candidates = ([], ["relative"], [str(repo)], [str(inside)], [str(root)], [str(root / "missing")],
                          [str(filled)], [str(filled / "synthetic.txt")], [str(other)], [str(checkout)],
                          [str(ambiguous)], [str(bare)],
                          [str(root / "x" / ".." / "unchecked")], [r"\\synthetic\share\output"])
            with patch.object(b, "REPO", repo), patch.object(b, "build") as build:
                for tail in candidates:
                    with self.subTest(tail=tail), redirect_stderr(StringIO()):
                        self.assertEqual(b.main(["--internal", *tail]), 2)
                unchecked = root / "not-writable"
                unchecked.mkdir(mode=0o700)
                with patch.object(b.os, "access", return_value=False), redirect_stderr(StringIO()):
                    self.assertEqual(b.main(["--internal", str(unchecked)]), 2)
                build.assert_not_called()
            self.assertEqual((filled / "synthetic.txt").read_text(encoding="utf-8"), "leave untouched")

    @unittest.skipIf(sys.platform == "win32", "symlink creation may require elevation on Windows")
    def test_internal_rejects_symlink_destination_and_ancestor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            repo = root / "repo"
            repo.mkdir()
            safe = root / "real" / "empty"
            safe.mkdir(parents=True)
            alias = root / "alias"
            alias.symlink_to(safe.parent, target_is_directory=True)
            with patch.object(b, "REPO", repo):
                for dest in (alias, alias / "empty"):
                    with self.assertRaisesRegex(ValueError, "symlinks"):
                        b.checked_internal_output(dest)

    def test_internal_rejects_synthetic_windows_reparse_point(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            repo = root / "repo"
            repo.mkdir()
            dest = root / "alias" / "empty"
            dest.mkdir(parents=True)
            real_lstat = Path.lstat
            def mock_lstat(path, *args, **kwargs):
                result = real_lstat(path, *args, **kwargs)
                if path == dest.parent:
                    return SimpleNamespace(st_mode=result.st_mode, st_file_attributes=b.stat.FILE_ATTRIBUTE_REPARSE_POINT)
                return result
            with patch.object(b, "REPO", repo), patch.object(Path, "lstat", mock_lstat):
                with self.assertRaisesRegex(ValueError, "reparse"):
                    b.checked_internal_output(dest)

    def test_internal_build_revalidates_before_read_and_before_write(self):
        with ExitStack() as stack:
            root = self.internal_fixture(stack)
            repo = root / "repo"
            repo.mkdir()
            out = root / "private"
            out.mkdir(mode=0o700)
            stack.enter_context(patch.multiple(b, REPO=repo, PUBLIC_OUTPUT=False, SITE=repo))
            load = stack.enter_context(patch.object(b, "load"))
            with self.assertRaisesRegex(ValueError, "outside"):
                b.build()
            load.assert_not_called()
            b.SITE = out
            stack.enter_context(patch.object(b, "UI_DEMO", repo / "not-present.html"))
            stack.enter_context(patch.object(b, "read_cube_asset", return_value=None))
            for name in ("home", "thinking", "architecture", "data", "compute", "results", "build",
                         "model_card", "safety", "roadmap", "glossary", "changelog", "run", "files", "chat", "device"):
                stack.enter_context(patch.object(b, "p_" + name, return_value="<p>synthetic page</p>"))
            def make_destination_nonempty():
                (out / "protected.html").write_text("synthetic hold", encoding="utf-8")
                return {}
            load.side_effect = make_destination_nonempty
            with self.assertRaisesRegex(ValueError, "empty"):
                b.build()
            self.assertEqual([p.name for p in out.iterdir()], ["protected.html"])
            self.assertEqual((out / "protected.html").read_text(encoding="utf-8"), "synthetic hold")
            approved = root / "fresh-private"
            approved.mkdir(mode=0o700)
            b.SITE = approved
            load.side_effect = None
            load.return_value = {}
            with patch.object(Path, "mkdir", side_effect=AssertionError("internal mkdir")), \
                    patch.object(Path, "unlink", side_effect=AssertionError("internal unlink")):
                result = b.build()
            self.assertEqual(len(result["sizes"]), 16)
            self.assertTrue(all(p.read_text(encoding="utf-8") == "<p>synthetic page</p>" for p in approved.iterdir()))
            for collision_name in ("index.html", b.CUBE_ASSET_NAME):
                collision = root / ("collision-" + collision_name)
                collision.mkdir(mode=0o700)
                b.SITE = collision
                target = collision / collision_name
                checks = 0
                original_check = b.checked_internal_output
                def check_then_plant(path):
                    nonlocal checks
                    resolved = original_check(path)
                    checks += 1
                    if checks == 2:
                        target.write_bytes(b"synthetic pre-existing file")
                    return resolved
                with patch.object(b, "checked_internal_output", side_effect=check_then_plant), \
                        patch.object(b, "read_cube_asset", return_value=b"synthetic asset"):
                    with self.assertRaises(FileExistsError):
                        b.build()
                self.assertEqual(target.read_bytes(), b"synthetic pre-existing file")

    def test_rendered_approval_reference_is_replaced_without_damaging_neighbors(self):
        root = r"X:\synthetic root"
        suffix = r"Documents\Codex\2099-01-02\OWNER_APPROVALS_20990102.md"
        slash_suffix = suffix.replace("\\", "/")
        for path in (suffix, root + "\\" + suffix, slash_suffix, "/synthetic only/" + slash_suffix):
            with self.subTest(path=path):
                staged = f"<p>Evidence: <code>{path}</code> (headings only)</p>"
                self.assertEqual(
                    b.scrub_page(staged),
                    f"<p>Evidence: <code>{b.APPROVAL_SOURCE_LABEL}</code> (headings only)</p>",
                )

    def test_synthetic_dictionary_reference_is_scrubbed_at_output(self):
        local = r"Documents\Codex\2099-01-02\OWNER_APPROVALS_20990102.md"
        raw = f"## A–Z entries\n**Fixture** — [Infrastructure]\n- *Source:* `{local}`.\n"
        rendered = b.scrub_page(b.p_glossary({"dict": raw, "entries": b.dict_entries(raw)}))
        self.assertIn(b.APPROVAL_SOURCE_LABEL, rendered)
        self.assertNotIn(local, rendered)

    def test_rel_omits_external_sources_and_keeps_repo_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            repo = base / "repo"
            repo.mkdir()
            external = base / "synthetic-off-repository" / "fixture.md"
            with patch.object(b, "REPO", repo.resolve()):
                self.assertEqual(b.rel(repo / "docs" / "fixture.md"), "docs/fixture.md")
                self.assertEqual(b.rel(external), b.OFF_REPO_SOURCE)
                self.assertEqual(b.rel(Path(r"X:\synthetic\outside.txt")), b.OFF_REPO_SOURCE)
                self.assertEqual(b.rel(repo / ".." / "outside.md"), b.OFF_REPO_SOURCE)

    @unittest.skipIf(sys.platform == "win32", "symlink creation may require elevation on Windows")
    def test_rel_omits_resolved_symlink_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            repo = parent / "repo"
            repo.mkdir()
            outside = parent / "synthetic-external.md"
            outside.touch()
            link = repo / "inside.md"
            link.symlink_to(outside)
            with patch.object(b, "REPO", repo.resolve()):
                self.assertEqual(b.rel(link), b.OFF_REPO_SOURCE)


class CheckerCanTripTests(unittest.TestCase):
    """The checks must be able to fail; otherwise a pass means nothing."""

    def test_missing_asset_trips_the_link_check(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            dd = Path(d)
            for f in b.SITE.glob("*.html"):
                (dd / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
            r = (dd / "roadmap.html").read_text(encoding="utf-8")
            (dd / "roadmap.html").write_text(r.replace("</body>", '<img src="no_such_asset.svg" alt="x"></body>'), encoding="utf-8")
            rep = b.check_site(dd)
            self.assertTrue(any("missing asset no_such_asset.svg" in x for x in rep["links"]), rep["links"])

    def _page(self, body: str) -> Path:
        d = Path(tempfile.mkdtemp())
        html = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
                '<title>Two Words</title></head><body><main>' + body + '</main></body></html>')
        (d / "x.html").write_text(html, encoding="utf-8")
        return d / "x.html"

    def test_lint_flags_unexplained_term(self):
        errs = b.lint_page(self._page("<p>The recipe brain names the limiting reagent.</p>"))
        self.assertTrue(any("recipe brain" in e for e in errs))

    def test_lint_accepts_explained_term(self):
        errs = b.lint_page(self._page("<p>" + b.T("recipe brain", also=("recipe",)) + " works.</p>"))
        self.assertFalse(any("'recipe brain'" in e for e in errs))

    def test_secret_scan_flags_planted_values(self):
        p = self._page("<p>write to someone@example.com with AKIA" + "ABCDEFGHIJKLMNOP</p>")
        rep = b.check_site(p.parent)
        kinds = " ".join(rep["secrets"])
        self.assertIn("e-mail", kinds)
        self.assertIn("AWS access key id", kinds)

    def test_contract_flags_c1_control_character(self):
        p = self._page("<p>Codex\x826-10-18</p>")
        self.assertTrue(any("C1 control character" in c for c in b.check_site(p.parent)["contract"]))

    def test_link_check_flags_broken_link(self):
        p = self._page('<p><a href="nowhere.html">x</a></p>')
        self.assertTrue(b.check_site(p.parent)["links"])


if __name__ == "__main__":
    unittest.main()
