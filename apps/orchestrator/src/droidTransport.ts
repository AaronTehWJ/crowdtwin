import { ProcessTransport } from '@factory/droid-sdk/node';

type Message = Parameters<ProcessTransport['send']>[0];
// SDK 0.10.0 omits execution-mode fields from its high-level options. CLI 0.249.0
// accepts them on initialize/update requests; CLI flags do not govern SDK sessions.
// Keep this compatibility adapter pinned and covered until the SDK exposes them.
export function directToolRequest(message: Message, allowedToolIds: string[]): Message {
  if ('method' in message && ['droid.initialize_session', 'droid.update_session_settings'].includes(message.method)) {
    if (!message.params || typeof message.params !== 'object' || Array.isArray(message.params))
      throw new Error('Invalid Droid settings request');
    return { ...message, params: {
      ...message.params,
      toolExecutionMode: 'direct_only', allowSubagentsInScripts: false,
      restrictToolIds: allowedToolIds,
    } } as Message;
  }
  return message;
}
export class RestrictedDroidTransport extends ProcessTransport {
  constructor(options: ConstructorParameters<typeof ProcessTransport>[0], private allowedToolIds: string[]) { super(options); }
  override send(message: Message) { return super.send(directToolRequest(message, this.allowedToolIds)); }
}
