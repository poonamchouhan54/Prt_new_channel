const express = require('express');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

const PLAYLIST_URL = 'https://raw.githubusercontent.com/poonamchouhan54/Prt_new_channel/refs/heads/main/playlist.json';

const HLS_DIR = path.join(__dirname, 'public', 'hls');
if (!fs.existsSync(HLS_DIR)){
    fs.mkdirSync(HLS_DIR, { recursive: true });
}

app.use('/hls', express.static(HLS_DIR));

app.get('/', (req, res) => {
    res.send('PRT Stream HLS Server is running! Stream link: /hls/stream.m3u8');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startStreamingLoop();
});

async function getPlaylist() {
    try {
        const response = await fetch(PLAYLIST_URL);
        return await response.json();
    } catch (error) {
        console.error('Playlist fetch error:', error);
        return [];
    }
}

function streamToHLS(streamUrl) {
    return new Promise((resolve) => {
        console.log('Starting HLS conversion for direct stream:', streamUrl);
        const playlistPath = path.join(HLS_DIR, 'stream.m3u8');

        const ffmpegArgs = [
            '-re',
            '-i', streamUrl,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-b:v', '1500k',
            '-maxrate', '1500k',
            '-bufsize', '3000k',
            '-pix_fmt', 'yuv420p',
            '-g', '50',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-f', 'hls',
            '-hls_time', '4',
            '-hls_list_size', '5',
            '-hls_flags', 'delete_segments+append_list',
            playlistPath
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        ffmpeg.stderr.on('data', (data) => {
            // console.log(`FFmpeg log: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            console.log(`Current stream finished with code: ${code}`);
            resolve();
        });

        ffmpeg.on('error', (err) => {
            console.error('FFmpeg error:', err);
            resolve();
        });
    });
}

async function startStreamingLoop() {
    while (true) {
        const playlist = await getPlaylist();
        if (!playlist || playlist.length === 0) {
            console.log('Playlist is empty, retrying in 10 seconds...');
            await new Promise(r => setTimeout(r, 10000));
            continue;
        }

        for (const video of playlist) {
            console.log(`Now playing: ${video.title}`);
            try {
                await streamToHLS(video.url);
            } catch (err) {
                console.error(`Error playing ${video.title}:`, err.message);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
}
