/** The DSH client connection controls used while restoring the current page. */

/** @typedef {'connected' | 'connecting' | 'disconnected' | undefined} ConnectionState */

/** @typedef {{ getSnapshot: () => ConnectionState, subscribe: (listener: () => void) => () => void }} ConnectionStateSource */

/** @typedef {{ reconnect: () => void, state: ConnectionStateSource }} ReconnectableConnection */

/** @type {ReconnectableConnection | undefined} */
let activeConnection;

/**
 * Attach the client-owned connection service for the restart control.
 * @param {ReconnectableConnection} connection - DSH connection service.
 * @returns {() => void} Disposer that removes this service if it is still active.
 */
export function attachConnection(connection) {
  activeConnection = connection;
  return () => {
    if (activeConnection === connection) activeConnection = undefined;
  };
}

/**
 * Read the current DSH connection state without opening another browser request.
 * @returns {ConnectionState} The current state, or undefined before attachment.
 */
export function getConnectionState() {
  return activeConnection?.state.getSnapshot();
}

/**
 * Subscribe to changes from DSH's live connection service.
 * @param {() => void} listener - Called after the connection state changes.
 * @returns {() => void} Disposer for the subscription.
 */
export function subscribeToConnection(listener) {
  return activeConnection?.state.subscribe(listener) ?? (() => {});
}

/**
 * Restart DSH's live connection loop and wait for a new connected state.
 * @param {number} timeoutMs - Maximum wait after requesting reconnection.
 * @returns {Promise<void>} Resolves after DSH reports a connected generation.
 */
export function reconnectAndWaitForConnected(timeoutMs) {
  const connection = activeConnection;
  if (connection === undefined) return Promise.reject(new Error('DSH connection service is unavailable'));

  return new Promise((resolve, reject) => {
    let finished = false;
    let unsubscribe = () => {};
    const finish = (complete) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe();
      complete();
    };
    const check = () => {
      if (connection.state.getSnapshot() === 'connected') finish(resolve);
    };
    const timer = setTimeout(() => finish(() => reject(new Error('DSH connection did not recover'))), timeoutMs);

    unsubscribe = connection.state.subscribe(check);
    try {
      connection.reconnect();
      check();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
