// Static assets exported from the approved Figma screens; bundled by Vite.
export const logoUrl = new URL('../assets/logo.png', import.meta.url).href;
const assets = {
  home: new URL('../assets/icons/9a4bf.svg', import.meta.url).href,
  homeActive: new URL('../assets/icons/3a1b0.svg', import.meta.url).href,
  users: new URL('../assets/icons/1365b.svg', import.meta.url).href,
  usersActive: new URL('../assets/icons/27adb.svg', import.meta.url).href,
  settings: new URL('../assets/icons/27bb8.svg', import.meta.url).href,
  settingsActive: new URL('../assets/icons/6f330.svg', import.meta.url).href,
  collapse: new URL('../assets/icons/d53a1.svg', import.meta.url).href,
  network: new URL('../assets/icons/ff712.svg', import.meta.url).href,
  expand: new URL('../assets/icons/db898.svg', import.meta.url).href,
  screenInactive: new URL('../assets/icons/154ee.svg', import.meta.url).href,
};

export type DesignIconName = keyof typeof assets;

export function designIconAsset(name: DesignIconName): {
  src: string;
  size: number;
} {
  return { src: assets[name], size: name.startsWith('screen') ? 20 : 22 };
}

export type AppPage = 'home' | 'room' | 'settings';
