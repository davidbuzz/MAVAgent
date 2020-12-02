cd /home/buzz/GCS/MAVAgent/
cp ~/GCS/mavlink/pymavlink/generator/javascript/implementations/mavlink_ardupilotmega_v2.0/mavlink.js ./mav_v2.js
rm -rf local_modules/
cp -rp ~/GCS/mavlink/pymavlink/generator/javascript/local_modules .
npm install
