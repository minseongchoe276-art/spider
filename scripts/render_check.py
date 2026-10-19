import bpy
from mathutils import Vector

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 600
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.world.color = (0.08, 0.08, 0.08)

cam_data = bpy.data.cameras.new('CheckCamera')
cam = bpy.data.objects.new('CheckCamera', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam.location = (3.8, -6.0, 2.7)
target = Vector((0, 0, 1.0))
direction = target - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 52

light_data = bpy.data.lights.new('CheckKey', 'AREA')
light_data.energy = 1200
light_data.shape = 'DISK'
light_data.size = 5
light = bpy.data.objects.new('CheckKey', light_data)
scene.collection.objects.link(light)
light.location = (3, -4, 5)
light.rotation_euler = (0.35, 0.0, 0.5)

scene.render.filepath = '/tmp/shadow-pulse-blend-check.png'
bpy.ops.render.render(write_still=True)
print('RENDERED', scene.render.filepath)
