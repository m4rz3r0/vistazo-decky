// Decky reloads a plugin in place (update, reinstall). Timers and retry loops started by the old
// copy must stop then, or two copies end up doing the same work: they check this before each step.
let unloaded = false;
export const isUnloaded = () => unloaded;
export const markUnloaded = () => {
  unloaded = true;
};
