import { ClientEmitter, SSRCs, VideoStream, WebRtcClient } from "@spacebarchat/spacebar-webrtc-types";
import EventEmitter from "node:events";
import { VoiceRoom } from "./VoiceRoom.js";
import { randomUUID } from "node:crypto";

export class PionWebRtcClient implements WebRtcClient<any> {
    websocket: any;
	user_id: string;
	voiceRoomId: string;
	webrtcConnected: boolean;
	emitter: ClientEmitter;

    public room?: VoiceRoom;
	public isStopped?: boolean;
	public incomingSSRCS?: SSRCs;
	public outgoingSSRCS?: Map<string, SSRCs>;
	public uniqueId?: string;

    constructor(
		userId: string,
		roomId: string,
		websocket: any,
		room: VoiceRoom,
	) {
		this.user_id = userId;
		this.voiceRoomId = roomId;
		this.websocket = websocket;
		this.room = room;
		this.webrtcConnected = false;
		this.incomingSSRCS = {};
		this.isStopped = false;
		this.outgoingSSRCS = new Map<string, SSRCs>();
		this.emitter = new EventEmitter()
		this.uniqueId = randomUUID();
	}

    public initIncomingSSRCs(ssrcs: SSRCs) {
        this.incomingSSRCS = ssrcs;
    }

    public getIncomingStreamSSRCs(): SSRCs {
		return this.incomingSSRCS || {}
    }

    public getOutgoingStreamSSRCsForUser(user_id: string): SSRCs {
        return this.outgoingSSRCS?.get(user_id) ?? {}
    }

    public isProducingAudio(): boolean {
        return !!this.incomingSSRCS?.audio_ssrc
    }

    public isProducingVideo(): boolean {
        return !!this.incomingSSRCS?.video_ssrc;
    }

    publishTrack (type: "audio" | "video", ssrc: SSRCs): Promise<void> {
		if(!this.incomingSSRCS) this.incomingSSRCS = {}

		if(type === "audio") {
			this.incomingSSRCS.audio_ssrc = ssrc.audio_ssrc;
		} else {
			this.incomingSSRCS = {...ssrc, audio_ssrc: this.incomingSSRCS.audio_ssrc}
		}

		this.room?.sfu.ipc.send({ type: "publish", clientId: this.uniqueId!, trackType: type})
		return Promise.resolve();
	}

    stopPublishingTrack (type: "audio" | "video"): void {
		if(type === "audio") {
			if(this.incomingSSRCS) this.incomingSSRCS.audio_ssrc = undefined
		}
		else {
			if(this.incomingSSRCS) {
				this.incomingSSRCS.video_ssrc = undefined;
				this.incomingSSRCS.rtx_ssrc = undefined;
			}
		}

		this.room?.sfu.ipc.send({type: "stop-publish", clientId: this.uniqueId!, trackType: type})
	}

    async subscribeToTrack(user_id: string, type: "audio" | "video"): Promise<void> {
		const otherClient = this.room?.getClientByUserId(user_id);
		if(!otherClient || !otherClient.uniqueId) {
			console.log(`Cannot subscribe: user ${user_id} not found in the current voice room`)
			return;
		}
		const result = await this.room?.sfu.ipc.request({type: "subscribe", clientId: this.uniqueId!, publisherId: otherClient.uniqueId, trackType: type})
		const sssr = this.outgoingSSRCS?.get(user_id) ?? {}
		if(!result || !result.ssrc) {
			console.log("unable to subscribe")
			return;
		}
		if(type === "audio") sssr.audio_ssrc = result.ssrc;
		else {
			sssr.video_ssrc = result.ssrc;
			sssr.rtx_ssrc = otherClient.getIncomingStreamSSRCs().rtx_ssrc;
		}

		console.log(`subscribed to track with ssrcs: ${result.ssrc}`)
		this.outgoingSSRCS?.set(user_id, sssr)
	}

    unSubscribeFromTrack(user_id: string, type: "audio" | "video"): void {
		const sssr = this.outgoingSSRCS?.get(user_id) ?? {}
		let unsubscribedSSRC = -1;
		if(type === "audio") {
			unsubscribedSSRC = sssr.audio_ssrc ?? -1;
			sssr.audio_ssrc = undefined;
		} else {
			unsubscribedSSRC = sssr.video_ssrc ?? -1;
			sssr.video_ssrc = undefined
			sssr.rtx_ssrc = undefined
		}
		
		const otherClient = this.room?.getClientByUserId(user_id);
		if(!otherClient || !otherClient.uniqueId) {
			console.log(`Cannot subscribe: user ${user_id} not found in the current voice room`)
			return;
		}
		console.log(`unsubscribed from track ssrcs: ${unsubscribedSSRC}`)
		this.room?.sfu.ipc.send({type: "unsubscribe", clientId: this.uniqueId!, trackType: type, publisherId: otherClient.uniqueId})
	}
	
    isSubscribedToTrack(user_id: string, type: "audio" | "video"): boolean { 
		const ssrc = this.outgoingSSRCS?.get(user_id) ?? {}

		if(type === "audio") return ssrc.audio_ssrc !== undefined
		else return ssrc.video_ssrc !== undefined
	 }
}