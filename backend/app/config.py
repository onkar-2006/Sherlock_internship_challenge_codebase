import base64
import os

API_KEY = os.environ.get("GEMINI_API_KEY")

# Load scheduled candidate baseline profile picture
BASELINE_CANDIDATE_PHOTO = ""
try:
    img_path = "john_doe_profile.png"
    if os.path.exists(img_path):
        with open(img_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            BASELINE_CANDIDATE_PHOTO = f"data:image/png;base64,{encoded_string}"
except Exception as e:
    print(f"Error loading baseline candidate photo: {e}")

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
