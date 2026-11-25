"""Produce a pooled comparison CSV/Markdown from matching serial benchmark JSON files."""
import argparse
import csv
import json
import statistics
from pathlib import Path


def quantile(values, p):
    return sorted(values)[int((len(values)-1)*p)]


def summarize(source):
    groups = {}
    for sample in source['samples']:
        groups.setdefault(sample['viewport'], []).append(sample)
    out = {}
    for name, samples in groups.items():
        updates = [v for s in samples for v in s['update_ms']]
        out[name] = {'samples':len(samples),'updates':len(updates),
            'boot_ms':statistics.median(s['boot_ms'] for s in samples),
            'roll_ms':statistics.median(s['roll_ms'] for s in samples),
            'roll_render_ms':statistics.median(s['gameplay_render_ms'][0] for s in samples),
            'discard_render_ms':statistics.median(s['gameplay_render_ms'][-1] for s in samples),
            'update_p50_ms':statistics.median(updates), 'update_p95_ms':quantile(updates,.95),
            'update_max_ms':max(updates),
            'paint_p95_ms':quantile([v for s in samples for v in s['paint_ms']], .95),
            'heap_bytes':statistics.median(s.get('metrics',{}).get('JSHeapUsedSize',0) for s in samples),
            'cache_bytes':statistics.median(s['diagnostics']['cacheBytes'] for s in samples),
            'body_bytes':statistics.median(s['diagnostics'].get('bodyBytes',0) for s in samples),
            'live_bytes':statistics.median(s['diagnostics'].get('liveBytes',0) for s in samples)}
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('candidate',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    old = summarize(json.loads(args.baseline.read_text()))
    new = summarize(json.loads(args.candidate.read_text()))
    rows = []
    for viewport in old:
        if viewport not in new:
            continue
        a,b = old[viewport],new[viewport]
        rows.append({'viewport':viewport,**{'baseline_'+k:v for k,v in a.items()},
                     **{'candidate_'+k:v for k,v in b.items()},
                     'p95_reduction_percent':100*(1-b['update_p95_ms']/a['update_p95_ms'])})
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator="\n");writer.writeheader();writer.writerows(rows)
    print('| Viewport | Baseline p50/p95 ms | Candidate p50/p95 ms | p95 reduction |')
    print('|---|---:|---:|---:|')
    for r in sorted(rows,key=lambda r:r['viewport']):
        print(f"| {r['viewport']} | {r['baseline_update_p50_ms']:.1f} / {r['baseline_update_p95_ms']:.1f} | {r['candidate_update_p50_ms']:.1f} / {r['candidate_update_p95_ms']:.1f} | {r['p95_reduction_percent']:.1f}% |")
