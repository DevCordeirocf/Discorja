// Test entry point only: exercise the production consent handler, but replace its
// system loopback grant with a known test frame. Never capture personal PC audio.
const { app, session } = require('electron');
app.whenReady().then(() => {
  const ses = session.defaultSession;
  const register = ses.setDisplayMediaRequestHandler.bind(ses);
  ses.setDisplayMediaRequestHandler = (handler, options) =>
    register((request, callback) => {
      handler(request, (streams) => {
        globalThis.audioTestGrant = {
          requested: request.audioRequested,
          granted: streams?.audio ?? null,
        };
        if (streams?.audio === 'loopback') {
          if (
            !globalThis.audioTestWindow ||
            globalThis.audioTestWindow.isDestroyed()
          )
            return callback({});
          streams = {
            ...streams,
            audio: globalThis.audioTestWindow.webContents.mainFrame,
          };
        }
        callback(streams);
      });
    }, options);
});
require('../../dist/electron/main.cjs');
