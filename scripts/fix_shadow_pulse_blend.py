import bpy
from pathlib import Path

project = Path('/Users/choeminseong/Desktop/게임')
glb = project / 'public/models/shadow-pulse-rig.glb'
blend = project / 'shadow-pulse-animated.blend'

# Start from a clean scene, including hidden leftovers from previous attempts.
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

# Import the verified SHADOW PULSE GLB.
bpy.ops.import_scene.gltf(filepath=str(glb))

# Make sure imported collections are visible in the viewport and renders.
for collection in bpy.data.collections:
    collection.hide_viewport = False
    collection.hide_render = False

# Put imported armatures into their binding/rest pose for clean animation setup.
for obj in bpy.context.scene.objects:
    if obj.type == 'ARMATURE':
        obj.data.pose_position = 'REST'
        obj.animation_data_clear()
        obj.show_in_front = False
        obj.data.display_type = 'STICK'
        obj.hide_viewport = True
        obj.hide_set(True)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    if obj.name.lower().startswith('icosphere'):
        bpy.data.objects.remove(obj, do_unlink=True)

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        for modifier in obj.modifiers:
            if modifier.type == 'ARMATURE':
                modifier.show_viewport = False

# Keep a clean, predictable frame range.
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 250
scene.frame_set(1)

bpy.ops.wm.save_as_mainfile(filepath=str(blend))
print('SAVED', blend)
print('OBJECTS', [(o.name, o.type) for o in scene.objects])
