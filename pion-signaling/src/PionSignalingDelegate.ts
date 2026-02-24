import { Codec, SignalingDelegate, WebRtcClient } from "@spacebarchat/spacebar-webrtc-types";
import { VoiceRoom } from "./VoiceRoom.js";
import { PionWebRtcClient } from "./PionWebRtcClient.js";
import { CodecInfo, MediaInfo, SDPInfo } from "semantic-sdp";
import { IpcClient } from "./IpcClient.js";

export class PionSignalingDelegate implements SignalingDelegate {
    private _ip: string;
	private _port: number;
	private _rooms: Map<string, VoiceRoom> = new Map();
	public ipc: IpcClient;

	constructor() {
		this.ipc = new IpcClient('sfu-ipc', this)
	}

    public async start(public_ip: string, portMin: number, portMax: number): Promise<void> {
		this._port = portMin;
		this._ip = public_ip;
		await this.ipc.connect();
    }

    public join(
		roomId: string,
		userId: string,
		ws: any,
		type: "guild-voice" | "dm-voice" | "stream",
	): Promise<WebRtcClient<any>> {
        // if this is guild-voice or dm-voice, make sure user isn't already in a room of those types
		// user can be in many simultanous go live stream rooms though (can be in a voice channel and watching a stream for example, or watching multiple streams)
		const rooms = type === "stream" ? [] : this.rooms
			.values()
			.filter((room) =>
				room.type === "dm-voice" || room.type === "guild-voice",
			);
		let existingClient;

		for (const room of rooms) {
			let result = room.getClientByUserId(userId);
			if (result) {
				existingClient = result;
				break;
			}
		}

		if (existingClient) {
			console.log("client already connected, disconnect..");
			this.onClientClose(existingClient);
		}

		if (!this._rooms.has(roomId)) {
			console.debug("no room created, creating one...");
			this.createRoom(roomId, type);
		}

		const room = this._rooms.get(roomId)!;

		const client = new PionWebRtcClient(userId, roomId, ws, room);

		room?.onClientJoin(client);

		this.ipc.send({ type: "join", clientId: client.uniqueId! })

		return Promise.resolve(client);
    }

    public async onOffer(
		client: WebRtcClient<any>,
		sdpOffer: string,
		codecs: Codec[],
	): Promise<{sdp: string, selectedVideoCodec: string}> {
        const room = this._rooms.get(client.voiceRoomId);

		if (!room) {
			console.error(
				"error, client sent an offer but has not authenticated",
			);
			Promise.reject();
		}

		const offer = SDPInfo.parse("m=audio\n" + sdpOffer);

		const rtpHeaders = new Map(offer.medias[0].extensions);

		const getIdForHeader = (
			rtpHeaders: Map<number, string>,
			headerUri: string,
		) => {
			for (const [key, value] of rtpHeaders) {
				if (value == headerUri) return key;
			}
			return -1;
		};

		const isChromium = codecs.find((val) => val.name == "opus")?.payload_type === 111;

		const audioMedia = new MediaInfo("0", "audio");
		const audioCodec = new CodecInfo(
			"opus",
			codecs.find((val) => val.name == "opus")?.payload_type ?? 111,
		);
		audioCodec.addParam("minptime", "10");
		audioCodec.addParam("usedtx", "1");
		audioCodec.addParam("useinbandfec", "1");
		audioCodec.setChannels(2);
		audioMedia.addCodec(audioCodec);

		audioMedia.addExtension(
			getIdForHeader(
				rtpHeaders,
				"urn:ietf:params:rtp-hdrext:ssrc-audio-level",
			),
			"urn:ietf:params:rtp-hdrext:ssrc-audio-level",
		);
		if (isChromium) {
			// if this is chromium, apply this header
			audioMedia.addExtension(
				getIdForHeader(
					rtpHeaders,
					"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
				),
				"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
			);
		}

		const videoMedia = new MediaInfo("1", "video");

		const videoCodec = new CodecInfo(
			"H264",
			codecs.find((val) => val.name == "H264")?.payload_type ?? 102,
		);
		videoCodec.setRTX(
			codecs.find((val) => val.name == "H264")?.rtx_payload_type ?? 103,
		);
		videoCodec.addParam("level-asymmetry-allowed", "1");
		videoCodec.addParam("packetization-mode", "1");
		videoCodec.addParam("profile-level-id", "42e01f");
		videoCodec.addParam("x-google-max-bitrate", "2500");
		videoMedia.addCodec(videoCodec);
		
		videoMedia.addExtension(
			getIdForHeader(
				rtpHeaders,
				"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
			),
			"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
		);
		videoMedia.addExtension(
			getIdForHeader(rtpHeaders, "urn:ietf:params:rtp-hdrext:toffset"),
			"urn:ietf:params:rtp-hdrext:toffset",
		);
		videoMedia.addExtension(
			getIdForHeader(
				rtpHeaders,
				"http://www.webrtc.org/experiments/rtp-hdrext/playout-delay",
			),
			"http://www.webrtc.org/experiments/rtp-hdrext/playout-delay",
		);
		videoMedia.addExtension(
			getIdForHeader(
				rtpHeaders,
				"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
			),
			"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
		);

		if (isChromium) {
			// if this is chromium, apply this header
			videoMedia.addExtension(
				getIdForHeader(rtpHeaders, "urn:3gpp:video-orientation"),
				"urn:3gpp:video-orientation",
			);
		}

		offer.medias = [audioMedia, videoMedia];
		
		const finalOffer = offer.toString().replace(' NaN ', ' 3984 ').replace(':actpass', ':active')

		console.log(finalOffer)
		const res = await this.ipc.request({type: "offer", clientId: (client as PionWebRtcClient).uniqueId!, sdp: finalOffer})

		if(!res.sdp) return Promise.reject();

		const answerSdp = SDPInfo.parse(res.sdp)

		//console.log(res.sdp)

		const candidate = answerSdp.candidates[0];
		const fingerprint = answerSdp.dtls.getHash() + " " + answerSdp.dtls.getFingerprint();

		const answer =
			`m=audio ${this.port} ICE/SDP\n` +
			`a=fingerprint:${fingerprint}\n` +
			`c=IN IP4 ${this.ip}\n` +
			`a=rtcp:${this.port}\n` +
			`a=ice-ufrag:${answerSdp.ice.getUfrag()}\n` +
			`a=ice-pwd:${answerSdp.ice.getPwd()}\n` +
			`a=fingerprint:${fingerprint}\n` +
			`a=candidate:1 1 ${candidate.getTransport()} ${candidate.getFoundation()} ${candidate.getAddress()} ${candidate.getPort()} typ host\n`;

		return Promise.resolve({sdp: answer, selectedVideoCodec: videoCodec.codec.toUpperCase()});
    }

    public onClientClose = (client: WebRtcClient<any>) => {
		this._rooms.get(client.voiceRoomId)?.onClientLeave(client);
		this.ipc.send({ type: "leave", clientId: (client as PionWebRtcClient).uniqueId! })
    }

    public updateSDP(offer: string): void {
		throw new Error("Method not implemented.");
	}

    public getClientsForRtcServer(rtcServerId: string): Set<WebRtcClient<any>> {
		if (!this._rooms.has(rtcServerId)) {
			return new Set();
		}

		return new Set(this._rooms.get(rtcServerId)?.clients.values())!;
	}

	public getClientByUniqueId(uniqueId: string): PionWebRtcClient | undefined {
		for (const room of this._rooms.values()) {
			let result = room.getClientByUniqueId(uniqueId);
			if (result) {
				return result;
			}
		}
		return undefined;
	}

	public createRoom(
		rtcServerId: string,
		type: "guild-voice" | "dm-voice" | "stream",
	): void {
		this._rooms.set(rtcServerId, new VoiceRoom(rtcServerId, type, this));
	}

    get ip(): string {
		return this._ip;
	}
	get port(): number {
		return this._port;
	}

	get rooms(): Map<string, VoiceRoom> {
		return this._rooms;
	}

	public async stop(): Promise<void> {
		for (const room of this._rooms.values()) {
			await room.stop();
		}
		await this.ipc.close();
		return Promise.resolve();
	}
}