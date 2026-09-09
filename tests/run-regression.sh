#!/bin/bash
# Y 轮全量回归（脚本文件形式，避免 shell 内联过长被拦）
cd /f/Space/PRO/test/funny-pets || exit 1
node tests/smoke.mjs < /dev/null > /tmp/sm3.txt 2>&1
echo "smoke_exit=$? checks=$(grep -cE '✓' /tmp/sm3.txt)"
for t in tests/deep-test*.mjs; do
  node "$t" < /dev/null 2>&1 | grep -E 'BUG-CONFIRMED|STILL-BUG|前置失败|"pass": false' > /dev/null \
    && echo "$t FAILED" || echo "$t: all-clear"
done
echo "=== Y轮回归结束 ==="
