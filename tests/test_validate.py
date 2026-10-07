import importlib.util
from pathlib import Path
import tempfile
import unittest

path = Path(__file__).resolve().parents[1] / "scripts/validate.py"
spec = importlib.util.spec_from_file_location("source_validate", path)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class HygieneTests(unittest.TestCase):
    def test_private_candidate_not_returned(self):
        candidate = "sk-" + "A" * 32
        result = validator.findings("secret = " + candidate)
        self.assertEqual([(1, "token")], result)
        self.assertNotIn(candidate, str(result))

    def test_allowlist_scoped_to_category_and_line(self):
        email = "person" + "@" + "example.invalid"
        text = email + " # ai-department-allow: email\n" + email
        self.assertEqual([(2, "email")], validator.findings(text))
        self.assertEqual([(1, "token")], validator.findings(
            "sk-" + "A" * 32 + " # ai-department-allow: email"))

    def test_private_host_path_and_session_export(self):
        text = "https://host." + "internal\n" + "C:" + "/Users/" + "private/file\n"
        text += '{"session_' + 'id": "value"}'
        self.assertEqual([(1, "internal-host"), (2, "user-path"), (3, "session-export")],
                         validator.findings(text))

    def test_generic_documented_paths_not_private_paths(self):
        self.assertEqual([], validator.findings("~/.claude/skills ~/.agents/skills <project-root>"))

    def test_frontmatter_duplicate_missing_and_valid_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            document = Path(folder) / "SKILL.md"
            document.write_text("---\nname: example\ndescription: A purpose\n---\n", encoding="utf-8")
            self.assertEqual("example", validator.metadata(document)["name"])
            document.write_text("---\nname: example\nname: second\ndescription: Purpose\n---\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                validator.metadata(document)


if __name__ == "__main__":
    unittest.main()
