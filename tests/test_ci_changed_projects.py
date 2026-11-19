import unittest

from scripts.ci_changed_projects import classify_changed_paths


class ChangedProjectClassificationTests(unittest.TestCase):
    def test_mahjong_change_selects_only_mahjong(self):
        result = classify_changed_paths(
            ["projects/mahjong/web/presentation.js", "projects/mahjong/assets/tiles/a.svg"]
        )
        self.assertFalse(result["all"])
        self.assertTrue(result["mahjong"])
        self.assertEqual(
            [key for key, value in result.items() if key != "all" and value],
            ["mahjong"],
        )

    def test_project_workflow_change_selects_its_project(self):
        result = classify_changed_paths([".github/workflows/compilerlab.yml"])
        self.assertFalse(result["all"])
        self.assertTrue(result["compilerlab"])
        self.assertFalse(result["mahjong"])

    def test_pages_workflow_selects_aggregate_site_projects(self):
        result = classify_changed_paths([".github/workflows/pages.yml"])
        self.assertFalse(result["all"])
        self.assertTrue(result["entropylab"])
        self.assertTrue(result["rogue_survivor"])
        self.assertFalse(result["mahjong"])

    def test_constraintlab_helper_selects_constraintlab(self):
        result = classify_changed_paths(["scripts/ci_constraintlab_e2e.py"])
        self.assertFalse(result["all"])
        self.assertTrue(result["constraintlab"])
        self.assertTrue(result["reposcope"])

    def test_privacy_scripts_and_root_tests_also_select_reposcope_lint(self):
        result = classify_changed_paths(
            ["scripts/privacy_check.py", "tests/test_privacy_check.py", "docs/PRIVACY.md"]
        )
        self.assertFalse(result["all"])
        self.assertTrue(result["reposcope"])
        self.assertFalse(
            any(value for key, value in result.items() if key not in {"all", "reposcope"})
        )

    def test_docs_only_change_does_not_select_project_jobs(self):
        result = classify_changed_paths(["README.md", "PROJECTS.md", "docs/ENGINEERING.md"])
        self.assertFalse(result["all"])
        self.assertFalse(any(value for key, value in result.items() if key != "all"))

    def test_roguelab_is_left_to_its_independent_workflow(self):
        result = classify_changed_paths(
            ["projects/roguelab/scripts/verify.py", ".github/workflows/roguelab.yml"]
        )
        self.assertFalse(result["all"])
        self.assertFalse(any(value for key, value in result.items() if key != "all"))

    def test_shared_ci_change_selects_every_root_project(self):
        result = classify_changed_paths([".github/workflows/ci.yml"])
        self.assertTrue(result["all"])
        self.assertTrue(all(result[key] for key in result if key != "all"))

    def test_unknown_workflow_fails_safe_to_all_projects(self):
        result = classify_changed_paths([".github/workflows/new-project.yml"])
        self.assertTrue(result["all"])
        self.assertTrue(all(result[key] for key in result if key != "all"))

    def test_unknown_project_fails_safe_to_all_projects(self):
        result = classify_changed_paths(["projects/newlab/src/main.py"])
        self.assertTrue(result["all"])
        self.assertTrue(all(result[key] for key in result if key != "all"))

    def test_unknown_root_file_fails_safe_to_all_projects(self):
        result = classify_changed_paths(["new-build-config.toml"])
        self.assertTrue(result["all"])
        self.assertTrue(all(result[key] for key in result if key != "all"))


if __name__ == "__main__":
    unittest.main()
