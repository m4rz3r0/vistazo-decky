// Set while rendering a game page when Steam's tab strip was reduced to "Tus cosas". If Steam ever
// renames that tab, the filter does nothing and the strip stays visible, so the page never dead-ends.
let filtered = false;
export const tabsFiltered = () => filtered;
export const setTabsFiltered = (v: boolean) => {
  filtered = v;
};
