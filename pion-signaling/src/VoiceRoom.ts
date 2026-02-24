import { PionSignalingDelegate } from "./PionSignalingDelegate.js";
import { PionWebRtcClient } from "./PionWebRtcClient.js";

export class VoiceRoom {
    private _clients: Map<string, PionWebRtcClient>;
    private _id: string;
    private _sfu: PionSignalingDelegate;
    private _type: "guild-voice" | "dm-voice" | "stream";

    constructor(
        id: string,
        type: "guild-voice" | "dm-voice" | "stream",
        sfu: PionSignalingDelegate
    ) {
        this._id = id;
        this._type = type;
        this._clients = new Map();
        this._sfu = sfu;
    }

    onClientJoin = (client: PionWebRtcClient) => {
        // do shit here
        this._clients.set(client.user_id, client);
    };

    onClientLeave = (client: PionWebRtcClient) => {
        // stop the client
        if (!client.isStopped) {
            client.isStopped = true;

            for (const otherClient of this.clients.values()) {
                //remove outgoing track for this user
                otherClient.outgoingSSRCS?.delete(client.user_id);
            }
            client.room = undefined;
            client.emitter.removeAllListeners();

            this._clients.delete(client.user_id)
        }
    }

    public async stop(): Promise<void> {
        for (const client of this.clients.values()) {
            if(client.isStopped) continue;
            client.isStopped = true;
            client.room = undefined;
            client.emitter.removeAllListeners();
            this._clients.delete(client.user_id)
        }
    }

    get clients(): Map<string, PionWebRtcClient> {
        return this._clients;
    }

    getClientByUserId = (id: string) => {
        return this._clients.get(id);
    };

    getClientByUniqueId = (id: string) => {
        return Array.from(this._clients.entries()).find(([userId, client]) => client.uniqueId === id)?.[1];
    }

    get id(): string {
        return this._id;
    }

    get type(): "guild-voice" | "dm-voice" | "stream" {
        return this._type;
    }

    get sfu(): PionSignalingDelegate {
        return this._sfu;
    }
}