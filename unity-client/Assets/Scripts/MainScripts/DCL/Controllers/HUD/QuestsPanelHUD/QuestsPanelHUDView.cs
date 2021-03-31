using System;
using DCL.Helpers;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace DCL.Huds.QuestsPanel
{
    public interface IQuestsPanelHUDView
    {
        void RequestAddOrUpdateQuest(string questId);
        void RemoveQuest(string questId);
        void ClearQuests();
        void SetVisibility(bool active);
        bool isVisible { get; }
        void Dispose();
    }

    public class QuestsPanelHUDView : MonoBehaviour, IQuestsPanelHUDView
    {
        internal static int ENTRIES_PER_FRAME { get; set; } = 5;
        private const string VIEW_PATH = "QuestsPanelHUD";

        [SerializeField] private RectTransform availableQuestsContainer;
        [SerializeField] private RectTransform completedQuestsContainer;
        [SerializeField] private GameObject questsContainerSeparators;
        [SerializeField] private GameObject questPrefab;
        [SerializeField] internal QuestsPanelPopup questPopup;
        [SerializeField] private Button closeButton;
        [SerializeField] private DynamicScrollSensitivity dynamicScrollSensitivity;

        private static BaseDictionary<string, QuestModel> quests => DataStore.i.Quests.quests;

        private string currentQuestInPopup = "";
        internal readonly Dictionary<string, QuestsPanelEntry> questEntries =  new Dictionary<string, QuestsPanelEntry>();
        private bool layoutRebuildRequested = false;
        internal readonly List<string> questsToBeAdded = new List<string>();
        private bool isDestroyed = false;

        internal static QuestsPanelHUDView Create()
        {
            var view = Instantiate(Resources.Load<GameObject>(VIEW_PATH)).GetComponent<QuestsPanelHUDView>();
#if UNITY_EDITOR
            view.gameObject.name = "_QuestsPanelHUDView";
#endif
            return view;
        }

        public void Awake()
        {
            questPopup.gameObject.SetActive(false);
            closeButton.onClick.AddListener(() => DataStore.i.HUDs.questsPanelVisible.Set(false));
        }

        public void RequestAddOrUpdateQuest(string questId)
        {
            if (questsToBeAdded.Contains(questId))
                return;

            questsToBeAdded.Add(questId);
        }

        internal void AddOrUpdateQuest(string questId)
        {
            if (!quests.TryGetValue(questId, out QuestModel quest))
            {
                Debug.LogError($"Couldn't find quest with ID {questId} in DataStore");
                return;
            }

            if (!questEntries.TryGetValue(questId, out QuestsPanelEntry questEntry))
            {
                questEntry = Instantiate(questPrefab).GetComponent<QuestsPanelEntry>();
                questEntry.OnReadMoreClicked += ShowQuestPopup;
                questEntries.Add(questId, questEntry);
            }

            if (quest.isCompleted)
            {
                questEntry.transform.SetParent(completedQuestsContainer);
                FindHighestQuestEntryPosition(questEntry, x => x.id != questId && x.isCompleted && quest.completionTime > x.completionTime);
            }
            else
            {
                questEntry.transform.SetParent(availableQuestsContainer);
                FindHighestQuestEntryPosition(questEntry, x => x.id != questId && !x.isCompleted && quest.assignmentTime > x.assignmentTime);
            }
            questEntry.transform.localScale = Vector3.one;

            questsContainerSeparators.SetActive(completedQuestsContainer.childCount > 0);
            questEntry.Populate(quest);
            layoutRebuildRequested = true;
            dynamicScrollSensitivity.RecalculateSensitivity();
        }

        public void RemoveQuest(string questId)
        {
            questsToBeAdded.Remove(questId);

            if (!questEntries.TryGetValue(questId, out QuestsPanelEntry questEntry))
                return;
            questEntries.Remove(questId);
            questEntry.transform.SetParent(null);
            Destroy(questEntry.gameObject);

            if (currentQuestInPopup == questId)
                questPopup.Close();

            questsContainerSeparators.SetActive(completedQuestsContainer.childCount > 0);
            dynamicScrollSensitivity.RecalculateSensitivity();
        }

        public void ClearQuests()
        {
            questPopup.Close();
            foreach (QuestsPanelEntry questEntry in questEntries.Values)
            {
                questEntry.transform.SetParent(null);
                Destroy(questEntry.gameObject);
            }
            questEntries.Clear();
            questsToBeAdded.Clear();
            questsContainerSeparators.SetActive(completedQuestsContainer.childCount > 0);
            dynamicScrollSensitivity.RecalculateSensitivity();
        }

        internal void ShowQuestPopup(string questId)
        {
            if (!quests.TryGetValue(questId, out QuestModel quest))
            {
                Debug.Log($"Couldnt find quest with id {questId}");
                return;
            }

            Vector3 pos = questPopup.transform.position;
            pos.y = questEntries[questId].readMorePosition.y;
            questPopup.transform.position = pos;

            currentQuestInPopup = questId;
            questPopup.Populate(quest);
            questPopup.Show();
        }

        internal void Update()
        {
            if (layoutRebuildRequested)
            {
                layoutRebuildRequested = false;
                Utils.ForceRebuildLayoutImmediate(GetComponent<RectTransform>());
            }

            for (int i = 0; i < ENTRIES_PER_FRAME && questsToBeAdded.Count > 0; i++)
            {
                string questId = questsToBeAdded.First();
                questsToBeAdded.RemoveAt(0);
                AddOrUpdateQuest(questId);
            }
        }

        private void FindHighestQuestEntryPosition(QuestsPanelEntry entry, Func<QuestModel, bool> queryFilter)
        {
            int index = 0;
            //Find the last child position that fits the query
            using (var iterator = questEntries.GetEnumerator())
            {
                while (iterator.MoveNext())
                {
                    if (!quests.TryGetValue(iterator.Current.Key, out QuestModel questDefinition))
                        continue;

                    if (!queryFilter.Invoke(questDefinition))
                        continue;

                    int newIndex = iterator.Current.Value.transform.GetSiblingIndex() + 1;
                    if (newIndex > index)
                        index = newIndex;
                }
            }
            entry.transform.SetSiblingIndex(index);
        }

        public void SetVisibility(bool active) { gameObject.SetActive(active); }

        public bool isVisible => gameObject.activeSelf;

        public void Dispose()
        {
            if (!isDestroyed)
                Destroy(gameObject);
        }

        private void OnDestroy() { isDestroyed = true; }
    }
}