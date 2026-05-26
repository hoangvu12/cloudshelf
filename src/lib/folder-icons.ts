/**
 * Folder icons from Philipp Kief's Material Icon Theme (the icon set VS Code
 * users see in their file tree). Each SVG ships with hardcoded fill colors,
 * so Tailwind `text-*` classes do NOT control color — every folder type has
 * its own designed palette (orange for video, green for src, etc.).
 *
 * We do name-based detection only on the leaf segment of an S3 prefix. The
 * pattern table is intentionally short — it covers the obvious cases without
 * trying to replicate the full VS Code Material Icon Theme catalog (which
 * detects hundreds of project-folder names). Add more rows as real-world
 * bucket layouts make new ones useful.
 */

import type { FC, SVGProps } from "react";

import FolderDefault from "material-icon-theme/icons/folder.svg?react";
import FolderImages from "material-icon-theme/icons/folder-images.svg?react";
import FolderVideo from "material-icon-theme/icons/folder-video.svg?react";
import FolderAudio from "material-icon-theme/icons/folder-audio.svg?react";
import FolderDocs from "material-icon-theme/icons/folder-docs.svg?react";
import FolderSrc from "material-icon-theme/icons/folder-src.svg?react";
import FolderBackup from "material-icon-theme/icons/folder-backup.svg?react";
import FolderDatabase from "material-icon-theme/icons/folder-database.svg?react";
import FolderPublic from "material-icon-theme/icons/folder-public.svg?react";
import FolderPrivate from "material-icon-theme/icons/folder-private.svg?react";
import FolderUpload from "material-icon-theme/icons/folder-upload.svg?react";
import FolderDownload from "material-icon-theme/icons/folder-download.svg?react";
import FolderLog from "material-icon-theme/icons/folder-log.svg?react";
import FolderTemp from "material-icon-theme/icons/folder-temp.svg?react";
import FolderTest from "material-icon-theme/icons/folder-test.svg?react";
import FolderConfig from "material-icon-theme/icons/folder-config.svg?react";
import FolderContent from "material-icon-theme/icons/folder-content.svg?react";
import FolderHome from "material-icon-theme/icons/folder-home.svg?react";
import FolderTemplate from "material-icon-theme/icons/folder-template.svg?react";
import FolderTheme from "material-icon-theme/icons/folder-theme.svg?react";
import FolderReview from "material-icon-theme/icons/folder-review.svg?react";

type FolderIconComponent = FC<SVGProps<SVGSVGElement>>;

/**
 * Ordered, first-match-wins. Anchored regex so "images" matches but
 * "user-images-2024" doesn't accidentally pick up the wrong icon — bucket
 * names get long and ambiguous fast.
 */
const PATTERNS: Array<[RegExp, FolderIconComponent]> = [
  [/^(images?|imgs?|pics?|photos?|pictures?|gallery|screenshots?|assets)$/i, FolderImages],
  [/^(videos?|movies?|films?|clips?|recordings?|reels?)$/i, FolderVideo],
  [/^(audio|music|sounds?|songs?|podcasts?|tracks?)$/i, FolderAudio],
  [/^(docs?|documents?|documentation|wiki|manual|manuals?|readme)$/i, FolderDocs],
  [/^(src|sources?|code|scripts?|app|lib)$/i, FolderSrc],
  [/^(backups?|bak|archives?|old|history|snapshots?)$/i, FolderBackup],
  [/^(db|database|data|datasets?|dumps?)$/i, FolderDatabase],
  [/^(public|pub|cdn|static|www|web)$/i, FolderPublic],
  [/^(private|secret|hidden|internal|keys)$/i, FolderPrivate],
  [/^(uploads?|incoming|in|inbox|received)$/i, FolderUpload],
  [/^(downloads?|dl|out|outbox|exports?|delivery|deliver)$/i, FolderDownload],
  [/^(logs?|errors?|audit|events?|trace)$/i, FolderLog],
  [/^(tmp|temp|cache|caches|scratch)$/i, FolderTemp],
  [/^(tests?|specs?|__tests__|fixtures?|samples?|qa)$/i, FolderTest],
  [/^(config|configs?|settings?|conf|env)$/i, FolderConfig],
  [/^(content|articles?|posts?|blog|pages?)$/i, FolderContent],
  [/^(home|user|users|profile|profiles|accounts?)$/i, FolderHome],
  [/^(templates?|skeletons?)$/i, FolderTemplate],
  [/^(themes?|styles?|design|brand)$/i, FolderTheme],
  [/^(reviews?|feedback|comments?)$/i, FolderReview],
];

/**
 * Returns the colored Material Icon Theme folder component that best fits
 * `name`. `name` should be the bare leaf segment (no trailing slash, no
 * parent prefix). Falls back to the plain blue folder if nothing matches.
 */
export function folderIconFor(name: string): FolderIconComponent {
  for (const [re, Icon] of PATTERNS) {
    if (re.test(name)) return Icon;
  }
  return FolderDefault;
}
