import type {
  AppConfig,
  DiscorjaAPI,
  UpdateState,
} from '../../../shared/protocol';

type BootstrapOptions = {
  api: DiscorjaAPI;
  render: () => void;
  setForeground: (foreground: boolean) => void;
  setConfig: (config: AppConfig) => void;
  setSettingUrl: (url: string) => void;
  setLoaded: (loaded: boolean) => void;
  setUpdate: (state: UpdateState) => void;
  notifyConfigError: () => void;
};

export function bootstrapDesktopApp(options: BootstrapOptions): void {
  const { api, render } = options;
  api.onForeground(options.setForeground);
  void api
    .getForeground()
    .then(options.setForeground)
    .catch(() => undefined);
  api.onUpdate((state) => {
    options.setUpdate(state);
    render();
  });
  void api
    .getConfig()
    .then((config) => {
      options.setConfig(config);
      options.setSettingUrl(config.signalingUrl);
      options.setLoaded(true);
      void api
        .getUpdateState()
        .then((state) => {
          options.setUpdate(state);
          render();
        })
        .catch(() => undefined);
      render();
    })
    .catch(options.notifyConfigError);
}
