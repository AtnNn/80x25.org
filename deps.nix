let
  pkgs = import (
    fetchTarball "https://github.com/NixOS/nixpkgs/archive/4f301350dacb4eb0a93578ef3b07c8a996c777e7.tar.gz"
  ) {};

  buildrootDeps = with pkgs; [
    ncurses
    file
    bc
  ];

in pkgs.buildEnv {
  name = "80x25-build-deps";
  paths = buildrootDeps;
  # pathsToLink = [ "/bin" "/share" ]
  extraOutputsToInstall = [ "man" "doc" "dev" ];
}

