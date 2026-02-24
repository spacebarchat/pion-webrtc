# spacebar-pion-webrtc

## how to run
1. start your go sfu daemon by navigating to `./pion-sfu` and running 
```
go run . -port <udp port> -ip <your server public ip>
```

2. install the signaling package into your spacebar server 
```
npm install @spacebarchat/pion-webrtc --no-save
```