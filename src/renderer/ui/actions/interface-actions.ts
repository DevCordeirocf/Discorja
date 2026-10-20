import { testSignalingConnection } from '../../features/settings';
import { toggleSidebar } from '../components/sidebar';

type ConnectionOptions = Parameters<typeof testSignalingConnection>[0];

export function createInterfaceActions(options: {
  root: HTMLElement;
  sidebarCollapsed: () => boolean;
  setSidebarCollapsed: (value: boolean) => void;
  saveSidebarCollapsed: (value: boolean) => void;
  connection: () => ConnectionOptions;
}): {
  toggleSidebar(): void;
  testConnection(): Promise<void>;
} {
  return {
    toggleSidebar: () =>
      toggleSidebar({
        root: options.root,
        isCollapsed: options.sidebarCollapsed,
        setCollapsed: options.setSidebarCollapsed,
        saveCollapsed: options.saveSidebarCollapsed,
      }),
    testConnection: () => testSignalingConnection(options.connection()),
  };
}
