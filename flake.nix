{
  description = "Spacebar Go WebRTC server built with Pion.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/master"; # temp hack because unstable is frozen
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    let
      rVersion =
        let
          rev = self.sourceInfo.shortRev or self.sourceInfo.dirtyShortRev;
          date = builtins.substring 0 8 self.sourceInfo.lastModifiedDate;
          time = builtins.substring 8 6 self.sourceInfo.lastModifiedDate;
        in
        "preview.${date}-${time}"; # +${rev}";
    in
    flake-utils.lib.eachSystem flake-utils.lib.allSystems (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
        lib = pkgs.lib;
      in
      {
        packages = {
          default = (pkgs.callPackage (import ./default.nix { inherit self rVersion; })) { };
        };

        containers = {
          docker = {
            default = pkgs.dockerTools.buildLayeredImage {
              name = "spacebar-webrtc-pion";
              tag = builtins.replaceStrings [ "+" ] [ "_" ] self.packages.${system}.default.version;
              contents = [
                self.packages.${system}.default
                pkgs.dockerTools.binSh
                pkgs.dockerTools.usrBinEnv
                pkgs.dockerTools.caCertificates
              ];
              # TODO
              config = {
                Cmd = [ "${self.outputs.packages.${system}.default}/bin/pion-sfu" ];
                WorkingDir = "/data";
                Env = [
                  "PORT=3001"
                ];
                Expose = [ "3001" ];
              };
            };
          };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            go
          ];
        };
      }
    );
}
