# Planetoids

Fly a spaceship through a procedural asteroid field; score is distance from spawn. [Play](https://himayetsu.github.io/Planetoids/) · open `index.html` or serve the folder to run locally.

---

It started as an experiment in procedural generation: mathematical noise, seeds, and what you could get from feeding them into a 3D field and marching rays through it. Over time, the idea shifted towards a more practical setting rather than just an experiment. The world is still that same idea—layered 3D noise with a threshold so that low values are rock and high values are void. You get floating asteroids and empty space. We darken the nooks and crannies by sampling the field a bit in front of the surface, so the rocks feel solid.

Collision had to match what you see. The field lives in the shader, so we ported it to JavaScript: same hash, same layered noise, same formula and the same safe-zone falloff. The ship checks several points around it against this copy of the field each frame. We added a small margin so that tiny differences between the shader and JavaScript don’t create invisible walls or let you pass through rock.

Spawn works the same way. We turn the safe zone off, search outward in a spiral until we find a clear spot, set the start position, then turn the safe zone back on (50 m). The shader and the JavaScript version both carve out that bubble the same way, so the cleared area is identical on screen and under the hood.

The camera was the trickiest part. If you build “right” and “up” from a fixed “world up,” everything breaks when you look straight up or down—the math goes to zero and the view flips or snaps. We fixed it by keeping a smoothed “up” direction instead. Each frame we project it onto the plane in front of you, use that for the camera’s up and then get “right” from it, and blend the smoothed vector gently back toward world up. When you’re looking exactly vertical we use a fallback. No more flips when you pitch up or fly through a loop.

We also had to ditch the usual “look at” style view matrix. Our setup uses forward as +Z; the standard one assumes -Z. The result was a mirrored or wrong fit between the scene and the ship. So we build the view from the camera’s position and its three axes directly, and everything lines up.

For controls we wanted the ship to aim at the crosshair but for the turn speed to feel right. So we scale how fast it turns by how far the cursor is from the center of the screen. Cursor near center means you barely turn; at the edge you get full rate. It’s “how far off-center” that drives the turn, not a single sensitivity number.
