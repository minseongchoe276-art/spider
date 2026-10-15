"""Run the new gesture checks against the pre-change actor in a temporary copy."""
import json, shutil, subprocess, tarfile, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[3]
out=Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='web-hand-before-') as tmp:
    workspace=Path(tmp)
    for name in ['src','scripts']:shutil.copytree(root/name,workspace/name)
    for name in ['public','node_modules']:(workspace/name).symlink_to(root/name,target_is_directory=True)
    shutil.copy2(root/'package.json',workspace/'package.json')
    with tarfile.open(out/'source-before-review.tar.gz') as backup:
        for name in ['src/Character.js','src/RemoteMotion.js']:(workspace/name).write_bytes(backup.extractfile(name).read())
    run=subprocess.run(['node','scripts/check-web-hand-pose.mjs'],cwd=workspace,capture_output=True,text=True)
    (out/'before-feature.log').write_text(run.stdout+run.stderr)
    result=json.loads((workspace/'docs/qa/web-hand-pose-2026-10-15/results.json').read_text())
    (out/'before-feature-results.json').write_text(json.dumps(result,indent=2)+'\n')
    failures=sum(x['status']=='FAIL' for x in result['results'])
    print(f'Original actor: {len(result["results"])-failures} passed, {failures} failed; exit {run.returncode} (expected 1).')
    assert run.returncode==1
