// 一次性迁移脚本：把 App.vue / PetDetail.vue / DevourChoice.vue / Celebration.vue / chat.js / storage.js
// 中用户可见中文字符串替换为 t() 调用。写回前打印 diff 摘要。
const fs = require('fs');
const ROOT = 'F:/Space/PRO/test/funny-pets/';

// ---- 文件级替换规则（正则 → 替换）。占位符 {x} 直接保留在 key 里 ----
const RULES = {
  'src/App.vue': [
    // script 区 toast/confirm/celebrate/effText
    [`showToast('链接无效或已损坏', 2600)`, `showToast(t('链接无效或已损坏'), 2600)`],
    [`showToast('你还没有精灵！点「返回游戏」→ 点地图去捕捉一只，再回来挑战', 4000)`, `showToast(t('你还没有精灵！点「返回游戏」→ 点地图去捕捉一只，再回来挑战'), 4000)`],
    [`showToast('队伍已休整完毕！')`, `showToast(t('队伍已休整完毕！'))`],
    ["showToast(`「${map.name}」尚未解锁：需要捕捉满 ${map.unlockAt} 只精灵，还差 ${need} 只（当前 ${save.counters.caught}/${map.unlockAt}）`, 3200)", "showToast(t('「{map}」尚未解锁：需要捕捉满 {n} 只精灵，还差 {d} 只（当前 {c}/{n}）', { map: mapName(map.name), n: map.unlockAt, d: need, c: save.counters.caught }), 3200)"],
    [`showToast('LLM 生成失败，本次使用本地随机')`, `showToast(t('LLM 生成失败，本次使用本地随机'))`],
    ["showToast('你已经领取过这只精灵啦', 2600)", "showToast(t('你已经领取过这只精灵啦'), 2600)"],
    ["celebrate('catch', adopted, '来自好友的赠送，加入你的队伍！')", "celebrate('catch', adopted, t('来自好友的赠送，加入你的队伍！'))"],
    ["showToast('精灵球用完了！开战打残它再捕，或换只精灵刷新重置')", "showToast(t('精灵球用完了！开战打残它再捕，或换只精灵刷新重置'))"],
    ["showToast(`${wild.value.name} 警觉起来了！球用完了——开战削弱它再捕吧`)", "showToast(t('{name} 警觉起来了！球用完了——开战削弱它再捕吧', { name: wild.value.name }))"],
    ["showToast(`${wild.value.name} 挣脱了精灵球！（剩余 ${ballsLeft.value} 次机会）`)", "showToast(t('{name} 挣脱了精灵球！（剩余 {n} 次机会）', { name: wild.value.name, n: ballsLeft.value }))"],
    ["showToast('还没有精灵伙伴！先丢球捕捉一只吧')", "showToast(t('还没有精灵伙伴！先丢球捕捉一只吧'))"],
    ["showToast('成功逃走了！')", "showToast(t('成功逃走了！'))"],
    ["showToast('战斗出现异常，已终止本场')", "showToast(t('战斗出现异常，已终止本场'))"],
    ["`-${e.damage}${e.crit ? ' 会心!' : ''}`", "`-${e.damage}${e.crit ? t(' 会心!') : ''}`"],
    ["celebrate('evolve', r.evolvedTo, `进化成了 ${r.evolvedTo.name}！灵魂也成长了`)", "celebrate('evolve', r.evolvedTo, t('进化成了 {name}！灵魂也成长了', { name: r.evolvedTo.name }))"],
    ["celebrate('levelup', mine, `${mine.name} 升到了 Lv.${mine.level}！获得 ${exp} 点经验`, r.statGains)", "celebrate('levelup', mine, t('{name} 升到了 Lv.{lv}！获得 {exp} 点经验', { name: mine.name, lv: mine.level, exp }), r.statGains)"],
    ["celebrate('win', mine, `${mine.name} 战胜了 ${state.wild.name}，+${exp} 经验`)", "celebrate('win', mine, t('{name} 战胜了 {foe}，+{exp} 经验', { name: mine.name, foe: state.wild.name, exp }))"],
    ["celebrate('evolve', e, `队伍中的 ${e.name} 进化了！`)", "celebrate('evolve', e, t('队伍中的 {name} 进化了！', { name: e.name }))"],
    ["celebrate('levelup', mine, `${mine.name} 升到了 Lv.${mine.level}！${r.newMoves.length ? r.newMoves.join('，') : `获得 ${exp} 点经验`}`, r.statGains)", "celebrate('levelup', mine, t('{name} 升到了 Lv.{lv}！获得 {exp} 点经验', { name: mine.name, lv: mine.level, exp }), r.statGains)"],
    ["celebrate('evolve', r.evolvedTo, `虽然输了，但 ${r.evolvedTo.name} 进化了！`)", "celebrate('evolve', r.evolvedTo, t('虽然输了，但 {name} 进化了！', { name: r.evolvedTo.name }))"],
    ["showToast('全军覆没…精灵们休息了一会儿又满血复活（休闲模式）')", "showToast(t('全军覆没…精灵们休息了一会儿又满血复活（休闲模式）'))"],
    ["battleLog.value.push({ type: 'status', text: `${state.active.name} 倒下了，请选择下一只精灵！` });", "battleLog.value.push({ type: 'status', text: t('{name} 倒下了，请选择下一只精灵！', { name: state.active.name }) });"],
    ["showToast(`${state.active.name} 倒下了！换其他精灵继续战斗`)", "showToast(t('{name} 倒下了！换其他精灵继续战斗', { name: state.active.name }))"],
    ["showToast('好友的精灵不能被捕捉！')", "showToast(t('好友的精灵不能被捕捉！'))"],
    ["celebrate('catch', adopted, '加入你的队伍！')", "celebrate('catch', adopted, t('加入你的队伍！'))"],
    ["showToast(`${mine.name} 吞噬成功！${devourDesc}`, 3600)", "showToast(t('{name} 吞噬成功！{desc}', { name: mine.name, desc: devourDesc }), 3600)"],
    ["else { showToast('最多上阵 4 只'); return; }", "else { showToast(t('最多上阵 4 只')); return; }"],
    ["if (!confirm(`确定放归 ${pet.name} 吗？此操作不可撤销。`)) return;", "if (!confirm(t('确定放归 {name} 吗？此操作不可撤销。', { name: pet.name }))) return;"],
    ["showToast(`${pet.name} 回归了大自然`)", "showToast(t('{name} 回归了大自然', { name: pet.name }))"],
    ["if (ok) showToast(`AI 输出语言已切换（下次生成生效）`, 2000);", "if (ok) showToast(t('语言已切换'), 2000);"],
    ["if (!confirm('导入会覆盖当前存档，确定继续吗？')) return;", "if (!confirm(t('导入会覆盖当前存档，确定继续吗？'))) return;"],
    ["showToast('导入成功');", "showToast(t('导入成功'));"],
    ["showToast(`导入失败：${err.message}`);", "showToast(t('导入失败：{err}', { err: err.message }));"],
    ["if (!confirm('确定清空全部存档吗？此操作不可撤销！')) return;", "if (!confirm(t('确定清空全部存档吗？此操作不可撤销！'))) return;"],
    // 模板区 nav
    [`>地图</button>`, `>{{ t('地图') }}</button>`],
    [`>相遇</button>`, `>{{ t('相遇') }}</button>`],
    [`>图鉴 <em>{{ save.pets.length }}</em></button>`, `>{{ t('图鉴') }} <em>{{ save.pets.length }}</em></button>`],
    [`>设置</button>`, `>{{ t('设置') }}</button>`],
    [`>🐾 分享宠</button>`, `>{{ t('🐾 分享宠') }}</button>`],
    [`<span class="brand-name">奇幻萌宠</span>`, `<span class="brand-name">{{ t('app.brand') }}</span>`],
  ],
  'src/chat.js': [
    ["`${pet.name} 记住了新的东西`", "t('{name} 记住了新的东西', { name: pet.name })"],
  ],
  'src/storage.js': [
    ["notify?.('存档读取失败，已重置。如需找回请勿覆盖导出文件。');", "notify?.(t('存档读取失败，已重置。如需找回请勿覆盖导出文件。'));"],
    ["notify?.('存档写入失败（存储空间不足或隐私模式）');", "notify?.(t('存档写入失败（存储空间不足或隐私模式）'));"],
    ["if (parsed?.magic !== EXPORT_MAGIC) throw new Error('不是有效的奇幻萌宠存档文件');", "if (parsed?.magic !== EXPORT_MAGIC) throw new Error(t('不是有效的奇幻萌宠存档文件'));"],
  ],
};

for (const [file, rules] of Object.entries(RULES)) {
  let s = fs.readFileSync(ROOT + file, 'utf8');
  let n = 0;
  for (const [from, to] of rules) {
    if (s.includes(from)) { s = s.split(from).join(to); n++; }
    else console.log(`MISS ${file}: ${from.slice(0, 60)}...`);
  }
  fs.writeFileSync(ROOT + file, s);
  console.log(`${file}: ${n}/${rules.length} replaced`);
}
