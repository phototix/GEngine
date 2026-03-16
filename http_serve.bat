@echo off
echo Starting HTTPS Server
"C:\node\node.exe" "C:\node\node_modules\http-server\bin\http-server" -S -C localhost.pem -K localhost-key.pem