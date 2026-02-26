# @spacebarchat/pion-webrtc
This is a pion-webrtc signaling bridge for spacebar. Uses IPC to exchange webrtc signaling information between your spacebar voice gateway and the Golang SFU process.

## Supported environments:

- [X] Linux
- [X] Mac Os X
- [ ] Windows (SFU process currently waiting on Microsoft to fix their named pipes golang package)

## Usage

Simply install it to your spacebar server by running the following command:

```
npm install @spacebarchat/pion-webrtc --no-save
```

then in your spacebar .env configure the server to load this package:

```
WRTC_LIBRARY=@spacebarchat/pion-webrtc
```
