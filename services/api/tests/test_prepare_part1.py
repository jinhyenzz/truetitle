import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from training.prepare_part1 import body_key, build_article, content_key, normalize_text


class TextNormalizationTest(unittest.TestCase):
    def test_removes_residual_double_quote_escapes(self):
        for count in (1, 2):
            quote = "\\" * count + '"'
            text = f"담당자는 {quote}변경 없다{quote}고 밝혔다."
            with self.subTest(backslashes=count):
                normalized = normalize_text(text)
                self.assertEqual(normalized, '담당자는 "변경 없다"고 밝혔다.')
                self.assertEqual(normalize_text(normalized), normalized)

    def test_preserves_quotes_and_other_backslashes(self):
        for text in (
            '기관은 "변경 없다"고 밝혔다.',
            "‘안내’와 “발언”, '인용'은 유지한다.",
            r"C:\news\report.txt",
            r"문자 그대로 \n \t \uAC00 \\를 표시한다.",
        ):
            with self.subTest(text=text):
                self.assertEqual(normalize_text(text), text)

    def test_normalizes_whitespace(self):
        self.assertEqual(normalize_text("  제목\n\t 본문\r\n끝  "), "제목 본문 끝")
        self.assertEqual(normalize_text(" \n\t"), "")


class ArticlePreparationTest(unittest.TestCase):
    def test_normalizes_both_fields_without_changing_labels_or_source(self):
        for label in (0, 1):
            raw = {
                "sourceDataInfo": {
                    "newsID": "TEST_001",
                    "newsContent": r'기관은 \\"변경 없다\\"고 밝혔다.',
                },
                "labeledDataInfo": {
                    "newTitle": r'기관 \\"변경 없다\\"',
                    "clickbaitClass": label,
                },
            }
            serialized = json.dumps(raw, ensure_ascii=False)
            source = json.loads(serialized)
            with self.subTest(label=label):
                article = build_article(source)
                expected = {
                    "id": "TEST_001",
                    "title": '기관 "변경 없다"',
                    "body": '기관은 "변경 없다"고 밝혔다.',
                    "label": label,
                }
                self.assertEqual(article, expected)
                self.assertEqual(source, raw)
                self.assertEqual(content_key(article), content_key(expected))
                self.assertEqual(body_key(article), body_key(expected))
                self.assertEqual(json.loads(json.dumps(article)), expected)


if __name__ == "__main__":
    unittest.main()
