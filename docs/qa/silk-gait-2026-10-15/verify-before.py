from pathlib import Path
import tempfile,shutil,tarfile,subprocess
root=Path.cwd();out=root/'docs/qa/silk-gait-2026-10-15'
with tempfile.TemporaryDirectory(prefix='spider-silk-before-') as d:
 t=Path(d);shutil.copytree(root/'src',t/'src');shutil.copytree(root/'scripts',t/'scripts');shutil.copy(root/'package.json',t/'package.json');(t/'node_modules').symlink_to(root/'node_modules',target_is_directory=True);(t/'public').symlink_to(root/'public',target_is_directory=True)
 with tarfile.open(out/'source-before-review.tar.gz') as f:f.extractall(t,filter='data')
 run=subprocess.run(['node','scripts/check-silk-gait.mjs'],cwd=t,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 (out/'before-regressions.log').write_text(run.stdout);shutil.copy(t/'docs/qa/silk-gait-2026-10-15/results.json',out/'results-before.json')
 print('Baseline regression exit:',run.returncode)
