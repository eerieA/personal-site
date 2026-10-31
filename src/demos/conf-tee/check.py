import json

from conftee.models.config_compare import ConfigCompare
from conftee.models.extract import Extract
from conftee.models.gen_summary import GenSummary
from conftee.models.outline import Outline
from conftee.utils import schema as schema_module
from conftee.utils.read_config import ReadConfig


def _read(text, path):
    # Goes through the library's own file reader, so line endings and the
    # final line are handled exactly as for a file on disk
    with open(path, "w") as f:
        f.write(text)
    return ReadConfig.read_config_from_txt(path)


def check(golden_text, user_text, schema_text, infra_json):
    try:
        schema = schema_module.loads(schema_text)
        golden = _read(golden_text, "/tmp/golden.txt")
        user = _read(user_text, "/tmp/user.txt")

        extract_golden, extract_user = Extract._extract_structs(golden, user)
        outline_golden = Outline(golden, extract_golden, True)
        outline_user = Outline(user, extract_user, False)
        comparer = ConfigCompare((extract_golden, extract_user), (outline_golden, outline_user), schema)
        kwargs = {"infra_prefixes": json.loads(infra_json)} if infra_json else {}
        results = comparer.calculate_diff(**kwargs)

        summary, _, report = GenSummary(schema).generate_reports(outline_golden, outline_user, results)
    except Exception as e:
        return json.dumps({"error": f"{type(e).__name__}: {e}"})

    # Some counts come back as numpy ints, which json cannot serialize
    return json.dumps({"summary": [[int(n), label] for n, label in summary], "report": json.loads(report)})
