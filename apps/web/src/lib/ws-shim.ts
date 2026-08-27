// Vite shim: isomorphic-ws's browser build lacks the named `WebSocket` export
// that @midnight-ntwrk/midnight-js-indexer-public-data-provider imports.
// Browsers have a global WebSocket — provide it as a named export.
export const WebSocket = (globalThis as any).WebSocket;
export default WebSocket;
