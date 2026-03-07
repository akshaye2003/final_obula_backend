import runpod
import os
import requests
from supabase import create_client
from scripts.pipeline import Pipeline

def handler(job):
    job_input = job["input"]
    video_id = job_input["video_id"]
    user_id = job_input["user_id"]
    input_url = job_input["input_url"]
    options = job_input.get("options", {})

    supabase = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )

    try:
        local_path = f"/tmp/{video_id}.mp4"
        r = requests.get(input_url)
        with open(local_path, 'wb') as f:
            f.write(r.content)

        pipeline = Pipeline()
        output_path = pipeline.process(local_path, **options)

        filename = f"{video_id}_output.mp4"
        storage_path = f"outputs/{user_id}/{filename}"
        with open(output_path, 'rb') as f:
            supabase.storage.from_("videos").upload(storage_path, f)

        video_url = supabase.storage.from_("videos").get_public_url(storage_path)

        from datetime import datetime, timedelta
        expires_at = (datetime.utcnow() + timedelta(minutes=30)).isoformat()

        supabase.table("videos").update({
            "status": "completed",
            "storage_path": storage_path,
            "expires_at": expires_at
        }).eq("id", video_id).execute()

        return {"status": "completed", "video_url": video_url, "expires_at": expires_at}

    except Exception as e:
        supabase.rpc("refund_credit", {"p_user_id": user_id}).execute()
        supabase.table("videos").update({"status": "failed"}).eq("id", video_id).execute()
        return {"status": "failed", "error": str(e)}

runpod.serverless.start({"handler": handler})
