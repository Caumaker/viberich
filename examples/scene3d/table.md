# Vibrating table in 3D
A 3D scene block: tour the steps, click a part to read about it and comment on it, or press Edit to change the scene.

```scene3d
{
 "title": "Vibrating table",
 "model": "table.glb",
 "parts": {
  "Table": {
   "label": "Table",
   "text": "Steel plate on four springs. The two motors shake it; amplitude is exaggerated in the animation."
  },
  "Motor": {
   "label": "Unbalanced motor",
   "text": "Two counter-rotating motors give a vertical force only."
  },
  "Spring": {
   "label": "Rubber spring",
   "text": "Isolates the base: only a small part of the force reaches the floor."
  },
  "Base": {
   "label": "Base",
   "text": "Heavy frame; stays still by its own weight."
  }
 },
 "notes": [
  {
   "point": [
    0,
    -270,
    170
   ],
   "text": "Front edge: where the board is loaded",
   "step": 0
  }
 ],
 "steps": [
  {
   "title": "The whole machine",
   "text": "Base, four springs, table and two motors.",
   "camera": {
    "pos": [
     1300,
     -1500,
     900
    ],
    "target": [
     0,
     0,
     120
    ]
   }
  },
  {
   "title": "The table shakes",
   "text": "The motors shake the **table**; the springs keep the base still.",
   "highlight": [
    "Table",
    "Motor_1"
   ],
   "vibrate": {
    "Table": {
     "axis": [
      0,
      0,
      1
     ],
     "amp": 8,
     "hz": 3
    },
    "Motor_1": {
     "axis": [
      0,
      0,
      1
     ],
     "amp": 8,
     "hz": 3
    }
   },
   "camera": {
    "pos": [
     900,
     -1000,
     500
    ],
    "target": [
     0,
     0,
     150
    ]
   }
  },
  {
   "title": "Springs",
   "text": "Lift the table to see the springs.",
   "highlight": [
    "Spring_1"
   ],
   "move": {
    "Table": [
     0,
     0,
     150
    ],
    "Motor_1": [
     0,
     0,
     150
    ]
   },
   "dur": 2
  },
  {
   "title": "Spring, cut and measured",
   "text": "Only the table and the springs are kept; the cut at Z 110 removes the table and shows the springs, with a fixed dimension line. A step can carry `isolate`, `section` and `measures`.",
   "isolate": [
    "Table",
    "Spring"
   ],
   "section": {
    "axis": "Z",
    "v": 110
   },
   "measures": [
    {
     "from": [
      380,
      -220,
      80
     ],
     "to": [
      380,
      -220,
      140
     ],
     "label": "spring 60 mm"
    }
   ],
   "camera": {
    "pos": [
     900,
     -700,
     420
    ],
    "target": [
     350,
     -220,
     110
    ]
   }
  },
  {
   "title": "Exploded",
   "text": "Assemblies pulled apart.",
   "explode": 0.9,
   "camera": {
    "pos": [
     1800,
     -2000,
     1400
    ],
    "target": [
     0,
     0,
     150
    ]
   }
  }
 ]
}
```

Run `viberich model <slug> examples/scene3d/table.glb` after publishing so the block finds `table.glb`.
