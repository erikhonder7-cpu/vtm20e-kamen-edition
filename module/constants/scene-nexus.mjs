// module/constants/scene-nexus.mjs
// Нексус сцен — карта переходов между сценами (порт из mass-effect / call-of-the-zone).
//
// Сцены собираются в именованные ГРУППЫ (например «Элизиум», «Даунтаун»)
// и подгруппы внутри них. Одна сцена может входить в несколько групп.
// Сцена-«переход» помечается флагом vtm20e-kamen-edition.nexus.open — только на такую
// игрок может перебросить свой токен.
//
// Группы лежат в мир-настройке "sceneGroups" (пишет только ГМ), поэтому список
// один для всех и не зависит от того, кто смотрит.

export const NEXUS_SCOPE = "vtm20e-kamen-edition";
export const GROUPS_KEY = "sceneGroups";      // мир-настройка (Array)
export const SCENE_FLAG = "nexus";            // флаг сцены { open, entry, label }

/** Цвет группы по умолчанию — кровь. */
export const DEFAULT_GROUP_COLOR = "#a3121b";

/* ── Чтение и запись ──────────────────────────────────────────────────── */

export function sceneGroups() {
  const raw = game.settings.get(NEXUS_SCOPE, GROUPS_KEY);
  return Array.isArray(raw) ? raw : [];
}
async function saveGroups(list) {
  if (!game.user.isGM) return;
  await game.settings.set(NEXUS_SCOPE, GROUPS_KEY, list);
}
/** Клон для безопасной правки: настройки кэшируются по ссылке. */
function cloneGroups() { return foundry.utils.deepClone(sceneGroups()); }

export function getGroup(id) { return sceneGroups().find(g => g.id === id) || null; }
export function groupsForScene(sceneId) {
  return sceneGroups().filter(g => (g.sceneIds || []).includes(sceneId));
}

/* ── Группы (ГМ) ──────────────────────────────────────────────────────── */

export async function createGroup(name = "Новый район") {
  const list = cloneGroups();
  const g = {
    id: foundry.utils.randomID(), name: String(name || "Район").trim() || "Район",
    color: DEFAULT_GROUP_COLOR, sceneIds: [], subgroups: [], order: list.length
  };
  list.push(g);
  await saveGroups(list);
  return g.id;
}
export async function renameGroup(id, name) {
  const list = cloneGroups(); const g = list.find(x => x.id === id); if (!g) return;
  g.name = String(name || "").trim() || g.name;
  await saveGroups(list);
}
export async function setGroupColor(id, color) {
  const list = cloneGroups(); const g = list.find(x => x.id === id); if (!g) return;
  g.color = color || DEFAULT_GROUP_COLOR;
  await saveGroups(list);
}
export async function deleteGroup(id) {
  await saveGroups(cloneGroups().filter(g => g.id !== id));
}
export async function moveGroup(id, dir) {
  const list = cloneGroups().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const i = list.findIndex(g => g.id === id); if (i < 0) return;
  const j = i + (dir < 0 ? -1 : 1); if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((g, k) => g.order = k);
  await saveGroups(list);
}
export async function addSceneToGroup(groupId, sceneId) {
  const list = cloneGroups(); const g = list.find(x => x.id === groupId); if (!g) return;
  g.sceneIds ||= [];
  if (!g.sceneIds.includes(sceneId)) g.sceneIds.push(sceneId);
  await saveGroups(list);
}
export async function removeSceneFromGroup(groupId, sceneId) {
  const list = cloneGroups(); const g = list.find(x => x.id === groupId); if (!g) return;
  g.sceneIds = (g.sceneIds || []).filter(s => s !== sceneId);
  for (const sg of (g.subgroups || [])) sg.sceneIds = (sg.sceneIds || []).filter(s => s !== sceneId);
  await saveGroups(list);
}

/* ── Подгруппы ────────────────────────────────────────────────────────── */

export async function createSubgroup(groupId, name = "Подгруппа") {
  const list = cloneGroups(); const g = list.find(x => x.id === groupId); if (!g) return;
  (g.subgroups ||= []).push({
    id: foundry.utils.randomID(),
    name: String(name || "Подгруппа").trim() || "Подгруппа", sceneIds: []
  });
  await saveGroups(list);
}
export async function renameSubgroup(groupId, subId, name) {
  const list = cloneGroups();
  const sg = list.find(x => x.id === groupId)?.subgroups?.find(s => s.id === subId);
  if (!sg) return;
  sg.name = String(name || "").trim() || sg.name;
  await saveGroups(list);
}
export async function deleteSubgroup(groupId, subId) {
  const list = cloneGroups(); const g = list.find(x => x.id === groupId); if (!g) return;
  // Сцены не теряются: они остаются в общем списке группы.
  g.subgroups = (g.subgroups || []).filter(s => s.id !== subId);
  await saveGroups(list);
}
export async function assignSceneToSub(groupId, subId, sceneId) {
  const list = cloneGroups(); const g = list.find(x => x.id === groupId); if (!g) return;
  if (!(g.sceneIds || []).includes(sceneId)) (g.sceneIds ||= []).push(sceneId);
  for (const sg of (g.subgroups || [])) sg.sceneIds = (sg.sceneIds || []).filter(s => s !== sceneId);
  const target = (g.subgroups || []).find(s => s.id === subId);
  if (target) (target.sceneIds ||= []).push(sceneId);
  await saveGroups(list);
}
export async function unassignScene(groupId, sceneId) {
  const list = cloneGroups(); const g = list.find(x => x.id === groupId); if (!g) return;
  for (const sg of (g.subgroups || [])) sg.sceneIds = (sg.sceneIds || []).filter(s => s !== sceneId);
  await saveGroups(list);
}

/* ── Флаг сцены-перехода ──────────────────────────────────────────────── */

export function sceneNexus(scene) {
  const f = scene?.getFlag?.(NEXUS_SCOPE, SCENE_FLAG) || {};
  return { open: !!f.open, entry: f.entry || null, label: f.label || "" };
}
