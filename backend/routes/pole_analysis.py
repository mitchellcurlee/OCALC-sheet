# AI-powered pole height estimation from photos
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import re
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/pole-analysis", tags=["Pole Analysis"])

# Database reference (set by server.py)
_db = None

def set_db(database):
    global _db
    _db = database


class HeightEstimationRequest(BaseModel):
    """Request body for height estimation"""
    image_base64: str  # Base64 encoded image
    pole_height_estimate: Optional[float] = 40  # Estimated total pole height in feet (default 40ft)


class AttachmentHeight(BaseModel):
    """Estimated height of a single attachment"""
    type: str  # e.g., "Power line", "Telecom cable", "Transformer"
    height_ft: float  # Estimated height in feet
    confidence: str  # "high", "medium", "low"
    description: str  # Brief description of the attachment


class HeightEstimationResponse(BaseModel):
    """Response with estimated heights"""
    success: bool
    pole_height_ft: float
    attachments: List[AttachmentHeight]
    analysis_notes: str


@router.post("/analyze-pole-heights", response_model=HeightEstimationResponse)
async def analyze_pole_heights(request: HeightEstimationRequest):
    """
    Analyze a pole photo and estimate attachment heights using AI vision.
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    # Clean base64 data (remove data URL prefix if present)
    image_data = request.image_base64
    if "," in image_data:
        image_data = image_data.split(",")[1]
    
    try:
        # Initialize the chat with vision model
        chat = LlmChat(
            api_key=api_key,
            session_id=f"pole-analysis-{id(request)}",
            system_message="""You are an expert utility pole analyst. Your job is to analyze photos of utility poles and estimate the height of attachments (power lines, telecom cables, transformers, etc.).

When analyzing a pole photo:
1. Identify all visible attachments on the pole
2. Estimate their heights based on:
   - Typical utility pole proportions (range from 20-65 feet, with 35-45 feet being most common)
   - Visual position relative to the total pole height provided by the user
   - Standard attachment height regulations (power usually 25-40ft, telecom 18-25ft, cable TV 15-20ft)
3. Provide confidence levels based on image clarity and visible references

Always respond in valid JSON format only, no other text."""
        ).with_model("openai", "gpt-4o")
        
        # Create image content
        image_content = ImageContent(image_base64=image_data)
        
        # Create the analysis prompt
        prompt = f"""Analyze this utility pole photo and estimate the height of each visible attachment.

Assumed total pole height: {request.pole_height_estimate} feet

Respond ONLY with a JSON object in this exact format:
{{
    "pole_height_ft": <estimated total pole height>,
    "attachments": [
        {{
            "type": "<attachment type: Power line, Telecom cable, Transformer, Street light, etc.>",
            "height_ft": <estimated height in feet>,
            "confidence": "<high/medium/low>",
            "description": "<brief description of the attachment>"
        }}
    ],
    "analysis_notes": "<any relevant observations about the pole or measurement challenges>"
}}

If no attachments are visible or the image doesn't show a utility pole, return:
{{
    "pole_height_ft": 0,
    "attachments": [],
    "analysis_notes": "<explanation of why analysis couldn't be performed>"
}}"""

        # Send message with image
        message = UserMessage(
            text=prompt,
            file_contents=[image_content]
        )
        
        response = await chat.send_message(message)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Parse JSON from response
        # Try to extract JSON from the response
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            result = json.loads(json_match.group())
        else:
            raise ValueError("No JSON found in response")
        
        return HeightEstimationResponse(
            success=True,
            pole_height_ft=result.get("pole_height_ft", request.pole_height_estimate),
            attachments=[
                AttachmentHeight(**att) for att in result.get("attachments", [])
            ],
            analysis_notes=result.get("analysis_notes", "")
        )
        
    except json.JSONDecodeError as e:
        return HeightEstimationResponse(
            success=False,
            pole_height_ft=request.pole_height_estimate,
            attachments=[],
            analysis_notes=f"Failed to parse AI response: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
