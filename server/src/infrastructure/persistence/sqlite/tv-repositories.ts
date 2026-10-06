import type { TvProgressRepository, TvVideoRepository } from '../../../domain/tv/repositories';
import type { SubtitleCue, TvPart, TvProgress, TvTranscript, TvVideo } from '../../../domain/tv/video';
import { SqliteStore } from './sqlite-store';
import { toSqlDate } from './dates';

interface VideoRow {
  id: string; title: string; channel: string; duration_s: number; thumbnail_file: string | null; parts: number;
}

interface PartRow {
  part_index: number; duration_s: number; video_file: string; audio_file: string;
}

const VIDEO_SELECT = `
  SELECT v.id, v.title, v.channel, v.duration_s, v.thumbnail_file, COUNT(p.id) AS parts
  FROM tv_videos v JOIN tv_parts p ON p.video_id = v.id`;

const toVideo = (r: VideoRow): TvVideo => ({
  id: r.id, title: r.title, channel: r.channel, durationS: r.duration_s, thumbnailFile: r.thumbnail_file, parts: r.parts,
});

/** As legendas são gravadas como JSON pelo script; uma coluna corrompida vira "sem legenda". */
function parseCues(json: string | null): SubtitleCue[] {
  try {
    const cues: unknown = JSON.parse(json || '[]');
    return Array.isArray(cues) ? cues as SubtitleCue[] : [];
  } catch {
    return [];
  }
}

export class SqliteTvVideoRepository extends SqliteStore implements TvVideoRepository {
  private readonly all = this.db.prepare(`${VIDEO_SELECT} GROUP BY v.id ORDER BY v.added_at, v.id`);
  private readonly one = this.db.prepare(`${VIDEO_SELECT} WHERE v.id = ? GROUP BY v.id`);
  private readonly partsOf = this.db.prepare(
    'SELECT part_index, duration_s, video_file, audio_file FROM tv_parts WHERE video_id = ? ORDER BY part_index');
  private readonly subs = this.db.prepare('SELECT subs_ja, subs_pt FROM tv_parts WHERE video_id = ? AND part_index = ?');

  list(): TvVideo[] {
    return (this.all.all() as VideoRow[]).map(toVideo);
  }

  find(id: string): TvVideo | null {
    const r = this.one.get(id) as VideoRow | undefined;
    return r ? toVideo(r) : null;
  }

  parts(videoId: string): TvPart[] {
    return (this.partsOf.all(videoId) as PartRow[]).map((r) => ({
      index: r.part_index, durationS: r.duration_s, videoFile: r.video_file, audioFile: r.audio_file,
    }));
  }

  transcript(videoId: string, part: number): TvTranscript | null {
    const r = this.subs.get(videoId, part) as { subs_ja: string | null; subs_pt: string | null } | undefined;
    return r ? { ja: parseCues(r.subs_ja), pt: parseCues(r.subs_pt) } : null;
  }
}

export class SqliteTvProgressRepository extends SqliteStore implements TvProgressRepository {
  private readonly byPlayer = this.db.prepare(
    'SELECT video_id, part_index FROM player_tv_progress WHERE player_id = ? ORDER BY updated_at DESC, rowid DESC');
  private readonly upsert = this.db.prepare(`
    INSERT INTO player_tv_progress (player_id, video_id, part_index, updated_at) VALUES (@player, @video, @part, @at)
    ON CONFLICT (player_id, video_id) DO UPDATE SET part_index = excluded.part_index, updated_at = excluded.updated_at`);
  private readonly deleteAll = this.db.prepare('DELETE FROM player_tv_progress WHERE player_id = ?');

  allFor(playerId: number): TvProgress[] {
    return (this.byPlayer.all(playerId) as { video_id: string; part_index: number }[])
      .map((r) => ({ videoId: r.video_id, part: r.part_index }));
  }

  save(playerId: number, progress: TvProgress, at: Date): void {
    this.upsert.run({ player: playerId, video: progress.videoId, part: progress.part, at: toSqlDate(at) });
  }

  deleteAllFor(playerId: number): void {
    this.deleteAll.run(playerId);
  }
}
