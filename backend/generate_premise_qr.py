import qrcode
import json
from pathlib import Path

premises = [
    (1, "Main Mall", "978bb97a-ba05-4d63-b873-ebf1859950a7"),
    (2, "Bank", "ebff60a4-96e7-4802-ba62-7c3b22777149"),
    (3, "Clinic", "a8c0677d-6f2e-4096-af06-827ca8f9d56f"),
    (4, "Harare CBD - Main Mall", "77b5adfc-e20f-444a-a03e-3a4927d281a1"),
    (5, "Borrowdale - North Gate", "90d3aa78-0ae5-4120-bf32-de012c0cc8d7"),
    (6, "Avondale Shopping Centre", "a35b0f0f-256c-413e-981d-2390738041be"),
    (7, "Parirenyatwa Hospital", "e76a6fc4-c984-4471-8ad0-27cf485ff32a"),
    (8, "University of Zimbabwe - Gate A", "e6933595-129b-4026-964e-1669912d9661"),
    (9, "Bulawayo Central Mall", "f5641032-2ae7-411f-8663-3dcc6031e92b"),
]

out_dir = Path("premise_qr_codes")
out_dir.mkdir(exist_ok=True)

for pid, name, uuid in premises:
    payload = {
        "type": "PREMISE",
        "premise_id": pid,
        "uuid": uuid,
        "name": name,
    }

    qr = qrcode.QRCode(
        version=2,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=4,
    )
    qr.add_data(json.dumps(payload))
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    filename = out_dir / f"{pid}_{name.replace(' ', '_')}.png"
    img.save(filename)

    print(f"✅ Generated: {filename}")
