import json
from pathlib import Path
from zipfile import ZipFile
from collections import Counter

zip_path = Path(r"C:\Users\wlsgu\Downloads\Sample.zip")

with ZipFile(zip_path) as archive:
    files = archive.namelist()

    counts = Counter()

    checked = set()

    for name in files:
        if not (
            name.startswith("Sample/02.라벨링데이터/Part1/")
            and name.endswith(".json")
        ):
            continue

        category = name.split("/")[3]

        if category in checked:
            continue

        with archive.open(name) as file:
            article = json.load(file)

        source = article.get("sourceDataInfo", {})
        label = article.get("labeledDataInfo", {})

        title = label.get("newTitle")
        body = source.get("newsContent")
        answer = label.get("clickbaitClass")

        print(f"\n종류: {category}")
        print("제목:", title)
        print("본문 글자 수:", len(body) if isinstance(body, str) else 0)
        print("정답:", answer)

        checked.add(category)

        if len(checked) == 3:
            break