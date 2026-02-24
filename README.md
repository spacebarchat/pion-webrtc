# spacebar-pion-webrtc

## How to run
1. Start your go sfu daemon by navigating to `./pion-sfu` and running 
```
go run . -port <udp port> -ip <your server public ip>
```

2. Install the signaling package into your Spacebar server 
```
npm install @spacebarchat/pion-webrtc --no-save
```