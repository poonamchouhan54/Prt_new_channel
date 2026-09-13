const express = require('express');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

const PLAYLIST_URL = 'https://raw.githubusercontent.com/poonamchouhan54/Prt_new_channel/refs/heads/main/YouTube.json';

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

async function getDirectStreamUrl(youtubeUrl) {
    return new Promise((resolve, reject) => {
        const ytdlp = spawn('yt-dlp', ['-g', '-f', 'best[height<=720]', youtubeUrl]);
        let url = '';

        ytdlp.stdout.on('data', (data) => { url += data.toString(); });

        ytdlp.on('close', (code) => {
            if (code === 0 && url.trim()) {
                resolve(url.trim().split('\n')[0]);
            } else {
                reject(new Error('Failed to get direct URL from yt-dlp'));
            }
        });
    });
}

function streamToHLS(streamUrl) {
    return new Promise((resolve) => {
        console.log('Starting HLS conversion for:', streamUrl);
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

        ffmpeg.on('close', (code) => {
            console.log(`Current video stream finished with code: ${code}`);
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
                const directUrl = await getDirectStreamUrl(video.url);
                await streamToHLS(directUrl);
            } catch (err) {
                console.error(`Error playing ${video.title}:`, err.message);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
}
