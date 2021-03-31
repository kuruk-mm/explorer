using System;
using UnityEngine;

[System.Serializable]
public class QuestTask
{
    public string id;
    public string type;
    public string payload;
    public string name;
    public string status;
    public string coordinates;
    public float progress;
    public DateTime completionTime = DateTime.Now;
}

[System.Serializable]
public class TaskPayload_Single
{
    public bool isDone;

}

[System.Serializable]
public class TaskPayload_Numeric
{
    public int start;
    public int end;
    public int current;
}