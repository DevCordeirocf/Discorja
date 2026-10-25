export type Notice = {
  text: string;
  kind: 'error' | 'info' | 'success';
};

export function createNotifier(deps: {
  getTimer(): ReturnType<typeof setTimeout> | undefined;
  setTimer(value: ReturnType<typeof setTimeout> | undefined): void;
  setNotice(value: Notice | null): void;
  render(): void;
}): (text: string, kind?: Notice['kind'], autoDismiss?: boolean) => void {
  return (text, kind = 'info', autoDismiss = false) => {
    clearTimeout(deps.getTimer());
    deps.setNotice({ text, kind });
    deps.render();
    if (autoDismiss)
      deps.setTimer(
        setTimeout(() => {
          deps.setNotice(null);
          deps.render();
        }, 3500),
      );
  };
}
