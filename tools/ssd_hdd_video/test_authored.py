import csv, importlib.util, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('authored',ROOT/'render_authored.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class AuthoredTimelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Original narration sentences are authoritative; source hashes also
        # detect edits that would invalidate an existing authored composition.
        import ast
        mod=ast.parse((ROOT/'render.py').read_text())
        sections=next(ast.literal_eval(n.value) for n in mod.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SECTIONS' for t in n.targets))
        cls.rows=[];t=0.0;idx=1
        for si,(title,sentences) in enumerate(sections):
            if si:t+=1.3
            for sentence in sentences:
                cls.rows.append({'index':idx,'start':t,'end':t+7.25,'section':title,'text':sentence});idx+=1;t+=7.25
        cls.total=t+1

    def test_every_frame_is_covered_once(self):
        scenes=m.build_scenes(self.rows,self.total)
        self.assertEqual(scenes[0]['start_frame'],0)
        self.assertEqual(scenes[-1]['end_frame'],round(self.total*m.FPS))
        for a,b in zip(scenes,scenes[1:]):self.assertEqual(a['end_frame'],b['start_frame'])
        self.assertTrue(all(s['end_frame']>s['start_frame'] for s in scenes))

    def test_same_visual_is_held_across_explanation(self):
        scenes=m.build_scenes(self.rows,self.total)
        self.assertEqual(scenes[0]['source_index'],1)
        self.assertEqual(scenes[0]['end_frame'],round(self.rows[1]['end']*m.FPS))
        self.assertGreater((scenes[0]['end_frame']-scenes[0]['start_frame'])/m.FPS,4.05)

    def test_changed_narration_requires_reauthoring(self):
        rows=[dict(x) for x in self.rows];rows[5]['text']+='追加'
        with self.assertRaisesRegex(ValueError,'Narration changed'):m.build_scenes(rows,self.total)

    def test_wrong_media_and_transform_jitter_are_absent(self):
        import json
        plan=json.loads((ROOT/'authored_storyboard_v16.json').read_text())
        assets={a for s in plan['scenes'] for a in s['assets']}
        self.assertTrue({'nvme_m2','laptop_nvme','ssd_controller'}.isdisjoint(assets))
        code=(ROOT/'render_authored.py').read_text()
        self.assertNotIn('zoompan',code)
        import inspect
        self.assertNotIn('sin(',inspect.getsource(m.render_scene))
        self.assertEqual(m.CAPTION_BOX,(72,878,1848,1042))
        self.assertLess(m.CHARACTER_BOX[3],m.CAPTION_BOX[1])

if __name__=='__main__':unittest.main()
