const fetch = require('node-fetch');
const { spawn } = require('child_process');

const PLAYLIST_URL = 'https://raw.githubusercontent.com/Prtstream820894/Prt-channel-live/refs/heads/main/YouTube.json';
// Aap apna RTMP URL aur Stream Key yahan daalenge (jaise YouTube Live ya koi aur server)
const RTMP_SERVER = process.env.RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2/YOUR_STREAM_KEY';

async function getPlaylist() {
    try {
        const response = await fetch(PLAYLIST_URL);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Playlist fetch karne me error:', error);
        return [];
    }
}

async function getDirectStreamUrl(youtubeUrl) {
    return new Promise((resolve, reject) => {
        // yt-dlp se direct playable link nikalna
        const ytdlp = spawn('yt-dlp', ['-g', '-f', 'best', youtubeUrl]);
        let url = '';

        ytdlp.stdout.on('data', (data) => {
            url += data.toString();
        });

        ytdlp.on('close', (code) => {
            if (code === 0 && url.trim()) {
                resolve(url.trim().split('\n')[0]);
            } else {
                reject(new Error('Direct URL nikalne me fail ho gaya'));
            }
        });
    });
}

function streamVideo(streamUrl) {
    return new Promise((resolve, reject) => {
        console.h('Streaming start ho rahi hai:', streamUrl);

        // FFmpeg command jo video ko RTMP par push karegi
        const ffmpegArgs = [
            '-re',
            '-i', streamUrl,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-maxrate', '3000k',
            '-bufsize', '6000k',
            '-pix_fmt', 'yuv420p',
            '-g', '50',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-f', 'flv',
            RTMP_SERVER
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        ffmpeg.stderr.on('data', (data) => {
            // FFmpeg logs (agar zaroorat ho toh dekh sakte hain)
            // console.log(`ffmpeg: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            console.log(`Video stream khatam huyi, code: ${code}`);
            resolve();
        });

        ffmpeg.on('error', (err) => {
            console.error('FFmpeg error:', err);
            reject(err);
        });
    });
}

async function startLoop() {
    while (true) {
        const playlist = await getPlaylist();
        if (!playlist || playlist.length === 0) {
            console.log('Playlist khali hai, 10 second baad dobara koshish kar rahe hain...');
            await new Promise(r => setTimeout(r, 10000));
            continue;
        }

        for (const video of playlist) {
            console.log(`Play ho raha hai: ${video.title} (${video.url})`);
            try {
                const directUrl = await getDirectStreamUrl(video.url);
                await streamVideo(directUrl);
            } catch (err) {
                console.error(`Error streaming ${video.title}:`, err.message);
                // Agar ek video me error aaye toh agle video par chale jao
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
}

startLoop();
