{pkgs}: {
  deps = [
    pkgs.freetype
    pkgs.fontconfig
    pkgs.dbus
    pkgs.at-spi2-core
    pkgs.at-spi2-atk
    pkgs.nspr
    pkgs.glib
    pkgs.cairo
    pkgs.pango
    pkgs.cups
    pkgs.alsa-lib
    pkgs.libdrm
    pkgs.expat
    pkgs.mesa
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.xorg.libxcb
    pkgs.nss
    pkgs.chromium
    pkgs.ffmpeg
  ];
}
