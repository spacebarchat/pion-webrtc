{
  self,
  rVersion,
}:
{
  pkgs,
  lib,
  ...
}:
let
  importJSON = file: builtins.fromJSON (builtins.readFile file);
in
pkgs.buildGo126Module (finalAttrs: {
  pname = "spacebar-webrtc-pion";
  version = (importJSON ./pion-signaling/package.json).version;

  src = ./pion-sfu;

  vendorHash = "sha256-tthWbVeyM4lw9i1XQO++8yUO9+oNBP44bbXTQTSC/Uk=";

  meta = {
    description = "Spacebar Go WebRTC server";
    homepage = "https://github.com/s074/spacebar-pion-webrtc";
    license = lib.licenses.agpl3Plus;
    maintainers = with lib.maintainers; [ RorySys ]; # for the nix package
    mainProgram = "pion-sfu";
  };
})
