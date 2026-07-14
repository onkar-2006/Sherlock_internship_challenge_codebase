import base64
import os
from dotenv import load_dotenv
load_dotenv() # Load from backend/ CWD
root_dotenv = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env")
load_dotenv(dotenv_path=root_dotenv) # Load from root CWD

API_KEY = os.environ.get("GEMINI_API_KEY")

# Load scheduled candidate baseline profile picture with Pillow resizing to prevent rate-limit errors
BASELINE_CANDIDATE_PHOTO = ""
try:
    img_path = "john_doe_profile.png"
    if os.path.exists(img_path):
        from PIL import Image
        import io
        with Image.open(img_path) as img:
            # Resize profile photo to matching low-latency bounds (160x120)
            img.thumbnail((160, 120))
            buffer = io.BytesIO()
            # Convert to RGB to ensure JPEG compatibility and compress
            img.convert("RGB").save(buffer, format="JPEG", quality=50)
            encoded_string = base64.b64encode(buffer.getvalue()).decode('utf-8')
            BASELINE_CANDIDATE_PHOTO = f"data:image/jpeg;base64,{encoded_string}"
except Exception as e:
    print(f"Error resizing and loading baseline candidate photo: {e}")

# Mock External Metadata from Invite matching PDF Available Information
EXTERNAL_METADATA = {
    "scheduled_candidate": "John Doe",
    "candidate_email": "john.doe@example.com",
    "calendar_invite": "Sherlock AI Technical Interview - John Doe",
    "interview_schedule": "12:00 PM - 1:00 PM",
    "interviewers": ["Alice Smith"],
    "observers": ["Shadow Recruiter", "Dev Observer"],
    "baseline_photo": BASELINE_CANDIDATE_PHOTO
}
