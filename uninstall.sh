# 系统服务
sudo systemctl disable --now orca-serve.service
sudo rm -f /etc/systemd/system/orca-serve.service
sudo systemctl daemon-reload

# 持有终端的守护进程（用户 scope），以及残留进程
systemctl --user list-units 'orca-daemon-*' --no-legend
systemctl --user stop 'orca-daemon-*.scope'
pgrep -af 'orca|daemon-entry' || echo 已无残留     # 有残留时再 kill 对应 pid

# 程序文件与命令
sudo rm -rf /opt/orca
ls -l ~/.local/bin/ | grep -i orca                   # 只删你自己建的 orca / orca-ide 链接
rm -f ~/.local/bin/orca ~/.local/bin/orca-ide
rm -rf ~/.cache/orca/appimage                        # AppImage 的解压缓存，可以放心删